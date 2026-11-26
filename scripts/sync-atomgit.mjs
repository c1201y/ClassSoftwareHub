#!/usr/bin/env node

// 把三个产品仓库（桌面版 / Win7 版 / 安卓）的 Release 产物同步到 AtomGit 分发仓库。
//
// 为什么要有这个脚本：下载页（#/desktop）的默认线路是 AtomGit，见
// src/gallery/atomgitChannel.ts。那边按约定拼直链，AtomGit 上缺版本时会回退到
// 本站节点并提示用户 —— 也就是说"忘了同步"不会让站点挂掉，但会让默认通道失效。
// 这个脚本就是那个"同步"。
//
// 设计要点：
//   · 幂等。以「AtomGit 上已有同名 tag 且资产体积一致」为已同步，可反复运行。
//   · 单点维护。主仓库放一份，三个仓库不各存一份，避免三份脚本各自漂移。
//   · 自愈。定时跑，漏推的版本下次自动补上，不依赖任何一个仓库的发版工作流成功。
//   · 只同步能确定的：体积与 GitHub 不一致的资产不传，宁可缺也不传错文件。
//
// 用法：
//   node scripts/sync-atomgit.mjs                 # 全量：检查三个仓库的最新版
//   node scripts/sync-atomgit.mjs --all           # 全量：检查每个仓库的全部 Release
//   node scripts/sync-atomgit.mjs --all --stable-only      # 只补历史正式版
//   node scripts/sync-atomgit.mjs --all --prerelease-only  # 只补历史预览版
//   node scripts/sync-atomgit.mjs --repo=android  # 只处理某一个组件
//   node scripts/sync-atomgit.mjs --tag=dv1.2.2   # 只处理某个 tag（配合 --repo）
//   node scripts/sync-atomgit.mjs --dry-run       # 只报告要做什么，不动远端
//
// ⚠️ 补历史版本前先看体积：桌面版 35 个版本共 2.4 GB，Win7 版 13 个共 1.7 GB。
//    AtomGit 实测上传吞吐约 90–200 KB/s，全量补齐要跑好几个小时，建议按
//    --stable-only / --prerelease-only 分轮，或交给 CI 定时任务慢慢跑。
//
// 环境变量：
//   GITHUB_TOKEN   读 GitHub Release / 下载资产（公开仓库可省，但会被限流到 60 次/小时）
//   ATOMGIT_TOKEN  AtomGit 访问令牌（必需，除非 --dry-run）

import { createHash } from 'node:crypto';
import { mkdirSync, createWriteStream, existsSync, statSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── 配置 ─────────────────────────────────────────────────────────── */

/** AtomGit 分发仓库 */
const ATOMGIT_OWNER = '2501_93857730';
const ATOMGIT_REPO = 'ClassSoftwareHub';
const ATOMGIT_API = 'https://atomgit.com/api/v5';

const GITHUB_OWNER = 'c1201y';

/**
 * 组件表。prefix 必须与 src/gallery/atomgitChannel.ts 的 TAG_PREFIX 一致，
 * 两处任一改动都要同步 —— 前端靠它拼直链，这里靠它建 tag。
 */
const COMPONENTS = [
  { key: 'desktop', repo: `${GITHUB_OWNER}/ClassSoftwareHub-Desktop`, prefix: 'desktop-' },
  { key: 'win7', repo: `${GITHUB_OWNER}/ClassSoftwareHub-windows7`, prefix: 'win7-' },
  { key: 'android', repo: `${GITHUB_OWNER}/ClassSoftwareHub-Android`, prefix: 'android-' }
];

/** 接口重试：AtomGit 的限流很紧（429），退避后重试 */
const RETRY_DELAYS_MS = [2000, 5000, 10000, 20000, 30000];

/**
 * 全局上传并发上限。
 *
 * 必须是**一个全局闸门**，不能分两层各自限流。
 * 本项目曾经同时有「版本级并发 4」和「资产级并发 4」，两者相乘等于最多 16 个上传同时进行
 * —— 远超实测拐点（8 条并发与 4 条相比已无收益），只会互相抢带宽、拖长单条耗时，
 * 也更容易撞上 OBS 的超时。
 *
 * 实测 AtomGit 的上传受服务端带宽限制：单条 92 KB/s、4 条聚合 207 KB/s、8 条聚合 205 KB/s，
 * 所以全局 4 是性价比最高的点。版本级并发仍然保留 —— 它让多个版本同时处在
 * 「下载 → 校验 → 上传」的不同阶段，把等待时间重叠起来。
 */
const MAX_UPLOADS = 4;

/** 简易信号量：把同时进行的上传卡在 MAX_UPLOADS 以内 */
let activeUploads = 0;
const uploadWaiters = [];
async function withUploadSlot(fn) {
  while (activeUploads >= MAX_UPLOADS) {
    await new Promise((resolve) => uploadWaiters.push(resolve));
  }
  activeUploads += 1;
  try {
    return await fn();
  } finally {
    activeUploads -= 1;
    const next = uploadWaiters.shift();
    if (next) next();
  }
}

/** 下载资产的临时目录 */
const WORK_DIR = join(tmpdir(), 'csh-atomgit-sync');

/** 单个资产下载的超时（毫秒）：产物最大约 95 MB，慢链路上也可能要几分钟 */
const ASSET_TIMEOUT_MS = 10 * 60 * 1000;

/** 上传单个资产的超时（毫秒）：同理给足，避免把慢当失败 */
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * 上传返回 203（OBS 回调失败）后，回查实际状态的等待梯度（毫秒）。
 * 回调是异步的：文件已经写进 OBS，但元数据登记可能晚几秒到几十秒。
 * 立刻查会把「其实已经传好」误判成失败，所以要等，并查几次。
 */
const CALLBACK_SETTLE_DELAYS_MS = [2000, 5000, 10000, 20000, 30000];

/**
 * GitHub 一次请求最多能取多少条（GitHub 的 per_page 上限就是 100）。
 * ⚠️ 这里曾经是 30，而桌面版仓库已经有 35 个 Release —— 用 --all 同步时会**静默漏掉**
 * 最早的 5 个，日志里看不出任何异常。取满上限，并在取回数量达到上限时提醒分页。
 */
const GITHUB_RELEASE_LIMIT = 100;

/* ── 命令行参数 ───────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const flagValue = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};

const DRY_RUN = hasFlag('dry-run');
const SYNC_ALL = hasFlag('all');
const ONLY_REPO = flagValue('repo');
const ONLY_TAG = flagValue('tag');

/**
 * 同时处理多少个版本。默认 4。
 *
 * 它**不控制上传并发** —— 真正的上传闸门是 MAX_UPLOADS（全局 4）。
 * 这里的作用是让多个版本同时处在「下载 → 校验 → 上传」的不同阶段，
 * 把下载等待与上传排队重叠起来。设太大只会让多个版本争抢同一批上传槽位，
 * 反而把内存里同时缓存的产物数量推高（每个最大约 95 MB）。
 */
const CONCURRENCY = Math.max(1, Math.min(8, Number(flagValue('concurrency')) || 4));
/**
 * 只同步某一类版本。
 * 历史版本一次性推完是 4 GB 量级，按 AtomGit 实测的上传吞吐要跑好几个小时，
 * 单个 CI 任务有 6 小时上限 —— 所以允许按通道拆开分轮跑。
 */
const ONLY_STABLE = hasFlag('stable-only');
const ONLY_PRERELEASE = hasFlag('prerelease-only');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

/**
 * AtomGit 令牌按需读取，不在模块加载时捕获。
 * 这样被 import 时（测试、复用）可以由调用方在 import 之后再设环境变量，
 * 也不会因为模块先被加载就把令牌定死成空串。
 */
const atomgitToken = () => process.env.ATOMGIT_TOKEN || '';

/* ── 日志 ─────────────────────────────────────────────────────────── */

/** 步骤级日志；CI 里靠着它判断卡在哪一步 */
const log = (msg) => console.log(msg);
const warn = (msg) => console.log(`::warning::${msg}`);
const fail = (msg) => {
  console.log(`::error::${msg}`);
  process.exitCode = 1;
};

const mb = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`;

/* ── HTTP ─────────────────────────────────────────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 带重试的请求。
 * 只对「可重试」的失败重试：网络错误、429、5xx。
 * 4xx（除 429）是参数问题，重试没有意义，直接抛出。
 *
 * `options.timeoutMs` 为单次尝试的超时（默认 120 s）。调用方传大文件的上传/下载时放宽，
 * 否则慢链路会被误判成失败 —— 但也不能不设，否则一次挂起的连接会卡住整轮同步。
 */
async function request(url, options = {}, label = '') {
  const { timeoutMs = 120000, ...init } = options;
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (response.status === 429 || response.status >= 500) {
        // 读掉响应体，避免连接泄漏
        await response.text().catch(() => {});
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_DELAYS_MS.length) break;
      const delay = RETRY_DELAYS_MS[attempt];
      warn(`${label || url} 失败（${error.message}），${delay / 1000}s 后重试`);
      await sleep(delay);
    }
  }
  throw new Error(`${label || url} 重试耗尽：${lastError?.message}`);
}

/** AtomGit API（带令牌头） */
async function atomgit(method, path, body, label) {
  const headers = {
    'PRIVATE-TOKEN': atomgitToken(),
    'User-Agent': 'csh-atomgit-sync',
    Accept: 'application/json'
  };
  let payload;
  if (body) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  const response = await request(
    `${ATOMGIT_API}${path}`,
    { method, headers, body: payload },
    label || `${method} ${path}`
  );
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* 非 JSON 响应（如上传回调的 "success"）由调用方处理 */
  }
  return { status: response.status, ok: response.ok, json, text };
}

/** GitHub API */
async function github(path, label, accept = 'application/vnd.github+json') {
  const headers = { 'User-Agent': 'csh-atomgit-sync', Accept: accept };
  if (GITHUB_TOKEN) headers.Authorization = `token ${GITHUB_TOKEN}`;
  const response = await request(`https://api.github.com${path}`, { headers }, label || path);
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`GitHub ${path} → HTTP ${response.status} ${detail.slice(0, 200)}`);
  }
  return response;
}

/* ── AtomGit 现有状态 ─────────────────────────────────────────────── */

/**
 * 取 AtomGit 上已有的 tag → 资产体积表。
 * 取不到（限流等）时返回 null，调用方据此退化为「逐个存在性检查」而不是「认为全都没有」——
 * 否则一次限流就会导致整轮都去重建 release。
 *
 * ⚠️ 必须翻页。只取第一页的话，一旦分发仓库的 release 超过一页（回填历史版本后就会），
 * 第二页往后的全被当成「不存在」，于是每轮都去重建 release、重传全部资产。
 * 而且这种错误不报错，只是慢 —— 是最难发现的一类。
 */
async function fetchAtomgitInventory() {
  const inventory = new Map();
  const PER_PAGE = 100;

  for (let page = 1; page <= 50; page++) {
    const { status, json } = await atomgit(
      'GET',
      `/repos/${ATOMGIT_OWNER}/${ATOMGIT_REPO}/releases?per_page=${PER_PAGE}&page=${page}`,
      null,
      `读取 AtomGit 现有 Release（第 ${page} 页）`
    );
    if (status !== 200 || !Array.isArray(json)) {
      warn(`读不到 AtomGit 现有 Release（HTTP ${status}，第 ${page} 页）`);
      // 第一页就失败 → 完全没有清单，调用方按 null 处理
      // 后续页失败 → 保留已拿到的部分，宁可多查也不要误判「全都没有」
      return page === 1 ? null : inventory;
    }
    for (const release of json) {
      if (!release.tag_name) continue;
      const assets = new Map();
      for (const asset of release.assets ?? []) {
        // AtomGit 会自动给每个 release 附源码包，标记为 source，不是我们推的
        if (asset.type === 'source') continue;
        assets.set(asset.name, asset.size ?? 0);
      }
      inventory.set(release.tag_name, { assets, prerelease: Boolean(release.prerelease) });
    }
    // 不满一页就是最后一页
    if (json.length < PER_PAGE) break;
  }

  return inventory;
}

/* ── GitHub 侧 ────────────────────────────────────────────────────── */

/** 某个仓库的 Release 列表（去掉 draft） */
async function listGithubReleases(repo) {
  const response = await github(
    `/repos/${repo}/releases?per_page=${GITHUB_RELEASE_LIMIT}`,
    `列出 ${repo} 的 Release`
  );
  const releases = await response.json();
  if (!Array.isArray(releases)) throw new Error(`${repo} 的 Release 列表不是数组`);
  // draft 还没发布，没有稳定 URL 也没有可靠资产，跳过
  const live = releases.filter((r) => !r.draft && r.tag_name);
  // 取满上限通常意味着还有更早的没拿到；不静默，让人知道该分页了
  if (releases.length >= GITHUB_RELEASE_LIMIT) {
    warn(`${repo} 的 Release 已达单次上限 ${GITHUB_RELEASE_LIMIT} 条，更早的版本本轮未纳入`);
  }
  return live;
}

/**
 * 不往 AtomGit 同步的文件。
 * 预览图（dv1.2.png 之类）只服务于 GitHub Release 页面的排版，AtomGit 页面自带展示，
 * 站点代码也不会去取它；同步过去纯属每轮多传 1 MB。Release 正文里引用它的那一行会被去掉，
 * 否则 AtomGit 页面上会出现一张 404 图。
 */
const SKIP_ASSET_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

/** Release 里能同步的资产：发布流程上传的、体积非零的、且不是预览图 */
function assetsOf(release) {
  return (release.assets ?? []).filter(
    (a) => a.state === 'uploaded' && a.name && a.size > 0 && !SKIP_ASSET_RE.test(a.name)
  );
}

/* ── 下载与校验 ───────────────────────────────────────────────────── */

/**
 * 下载一个资产到本地，并把「读到一半超时」也算进重试。
 *
 * ⚠️ 这里不能直接用 request()：它返回的是响应头到手那一刻的 Response，
 * 而 `AbortSignal.timeout` 的计时覆盖整个响应体读取过程。也就是说超时通常发生在
 * pipeline 落盘阶段，那时早已出了 request() 的 try 块，异常不会被它捕获、不会重试。
 * 所以整个「取响应 + 落盘 + 校验体积」必须一起放进重试循环。
 */
async function downloadAsset(asset, destPath) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(asset.url, {
        headers: {
          'User-Agent': 'csh-atomgit-sync',
          Accept: 'application/octet-stream',
          ...(GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {})
        },
        // 大文件给足时间；OBS/CDN 慢的时候 12 MB 也可能要几分钟
        signal: AbortSignal.timeout(ASSET_TIMEOUT_MS)
      });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(destPath));
      const actual = statSync(destPath).size;
      if (actual !== asset.size) {
        throw new Error(`不完整：得到 ${actual} 字节，应为 ${asset.size} 字节`);
      }
      return actual;
    } catch (error) {
      lastError = error;
      // 半成品留着会让下一次追加而不是覆盖，先清掉
      if (existsSync(destPath)) rmSync(destPath, { force: true });
      if (attempt === RETRY_DELAYS_MS.length) break;
      const delay = RETRY_DELAYS_MS[attempt];
      warn(`下载 ${asset.name} 失败（${error.message}），${delay / 1000}s 后重试`);
      await sleep(delay);
    }
  }
  throw new Error(`下载 ${asset.name} 重试耗尽：${lastError?.message}`);
}

function sha256Of(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * 校验下载到的文件与 GitHub 记录的 sha256 一致。
 * GitHub 的 release asset 自带 `digest: "sha256:..."`（体积对得上不一定内容对得上）。
 * 接口没给 digest 的老资产就跳过校验 —— 不能因为缺字段就判失败。
 */
function verifyDigest(asset, localPath) {
  const expected = (asset.digest || '').replace(/^sha256:/, '').toLowerCase();
  if (!expected) return { checked: false };
  const actual = sha256Of(localPath);
  if (actual !== expected) {
    throw new Error(`内容校验失败：本地 ${actual.slice(0, 16)}… ≠ GitHub ${expected.slice(0, 16)}…`);
  }
  return { checked: true };
}

/* ── 同步一个 Release ─────────────────────────────────────────────── */

/** 建或更新 AtomGit 上的 Release（同一个 tag 重复调用是安全的） */
async function ensureAtomgitRelease(component, release, atomgitTag, atomgitBody) {
  const existing = await atomgit(
    'GET',
    `/repos/${ATOMGIT_OWNER}/${ATOMGIT_REPO}/releases/tags/${encodeURIComponent(atomgitTag)}`,
    null,
    `查询 AtomGit Release ${atomgitTag}`
  );

  if (existing.status === 200) {
    /**
     * 已存在：更新标题与正文，**但保留它当前的 release_status**。
     *
     * ⚠️ 这里曾经无条件写 `pre` / `none`，后果是每次同步都会把 `latest` 标记冲掉：
     * 分发仓库里被标为「最新版本」的那条（目前是 desktop-dv1.2.2）在 AtomGit 首页的
     * 徽章会消失，而日志里只写「已更新 Release」，看不出任何异常。
     * 「谁是最新」是发布者的判断，不是同步脚本该决定的事。
     */
    const currentStatus = existing.json?.release_status || 'none';
    if (DRY_RUN) {
      log(`    [dry-run] 将更新 AtomGit Release ${atomgitTag}（保留 status=${currentStatus}）`);
      return 'exists';
    }
    const patched = await atomgit(
      'PATCH',
      `/repos/${ATOMGIT_OWNER}/${ATOMGIT_REPO}/releases/${encodeURIComponent(atomgitTag)}?access_token=${encodeURIComponent(atomgitToken())}`,
      {
        tag_name: atomgitTag,
        name: atomgitName(component, release, atomgitTag),
        body: atomgitBody,
        release_status: currentStatus
      },
      `更新 AtomGit Release ${atomgitTag}`
    );
    if (patched.status !== 200) {
      throw new Error(`更新 AtomGit Release ${atomgitTag} 失败：HTTP ${patched.status} ${patched.text.slice(0, 200)}`);
    }
    log(`    已更新 Release ${atomgitTag}（status=${currentStatus}）`);
    return 'exists';
  }

  if (existing.status !== 404) {
    throw new Error(`查询 AtomGit Release ${atomgitTag} 失败：HTTP ${existing.status}`);
  }

  if (DRY_RUN) {
    log(`    [dry-run] 将新建 AtomGit Release ${atomgitTag}`);
    return 'created';
  }

  /**
   * AtomGit 限制：整仓最多只能有 20 个 release 标为 pre-release
   * （400 `At most 20 pre-release versions can be marked.`），而 GitHub 上光预览版就有 36 个。
   * 超出时不能整轮失败 —— 预览版的历史产物仍然要能下载，只是不挂「预发布」标记。
   * 所以撞到这个错误就退一步：不带 release_status 重建一次，标题里已写明是预览版，
   * 页面上依然分得清。
   */
  const attempt = async (status) => {
    const payload = {
      tag_name: atomgitTag,
      name: atomgitName(component, release, atomgitTag),
      body: atomgitBody,
      target_commitish: 'main'
    };
    if (status) payload.release_status = status;
    return atomgit(
      'POST',
      `/repos/${ATOMGIT_OWNER}/${ATOMGIT_REPO}/releases?access_token=${encodeURIComponent(atomgitToken())}`,
      payload,
      `新建 AtomGit Release ${atomgitTag}`
    );
  };

  /**
   * AtomGit 的两个坑，都必须处理，否则会留一堆空壳：
   *
   * ① 整仓最多只能有 20 个 release 标为 pre-release
   *    （400 `At most 20 pre-release versions can be marked.`），而 GitHub 上预览版有 36 个。
   *
   * ② 更要命的是：**返回 400 的同时，release 其实已经建好了**（只是没标记状态）。
   *    所以不能「去掉标记再建一次」—— 第二次会撞 409 Release already exists，
   *    本来只是标记失败的版本就变成整轮失败，那个已建好的 release 则成了空壳。
   *    正确做法是回查一次：tag 已经存在就直接用，需要的话 PATCH 把状态补成 none。
   */
  let created = await attempt(release.prerelease ? 'pre' : 'none');

  if (created.status === 400 && /pre-release/i.test(created.text)) {
    warn(`AtomGit 的预发布名额已满，${atomgitTag} 改以普通版本发布（产物照常可下载）`);
    // 400 时 release 通常已经建好，先回查
    const check = await atomgit(
      'GET',
      `/repos/${ATOMGIT_OWNER}/${ATOMGIT_REPO}/releases/tags/${encodeURIComponent(atomgitTag)}`,
      null,
      `回查 ${atomgitTag}`
    );
    if (check.status === 200) {
      created = { status: 200, ok: true, json: check.json, text: '' };
      // 状态没落上，补一次 none（PATCH 不受 20 个名额限制）
      const patched = await atomgit(
        'PATCH',
        `/repos/${ATOMGIT_OWNER}/${ATOMGIT_REPO}/releases/${encodeURIComponent(atomgitTag)}?access_token=${encodeURIComponent(atomgitToken())}`,
        {
          tag_name: atomgitTag,
          name: atomgitName(component, release, atomgitTag),
          body: atomgitBody,
          release_status: 'none'
        },
        `补正 ${atomgitTag} 的状态`
      );
      if (patched.status !== 200) {
        warn(`${atomgitTag} 状态补正失败：HTTP ${patched.status}（不影响资产上传）`);
      }
    } else {
      // 没建成才是真的没有，这时重试一次不带状态
      created = await attempt(undefined);
    }
  }

  if (created.status !== 200) {
    throw new Error(`新建 AtomGit Release ${atomgitTag} 失败：HTTP ${created.status} ${created.text.slice(0, 300)}`);
  }
  log(`    已新建 Release ${atomgitTag}`);
  return 'created';
}

/**
 * AtomGit 上这个 Release 的标题。
 * 上游标题有信息量（如「ClassSoftwareHub 桌面版 dv1.2.2 正式版」）就直接沿用；
 * 安卓仓库的标题恰好就是 tag 本身（`v1.2.2`），照搬过去在分发仓库里看不出是哪个组件，
 * 这时自己拼一个。末尾统一补「AtomGit 分发副本」，免得两个站看起来是两件不同的事。
 */
function atomgitName(component, release, atomgitTag) {
  const upstream = (release.name || '').trim();
  const informative = upstream && upstream !== release.tag_name;
  const base = informative ? upstream : `${component.label} ${release.tag_name}`;
  return `${base}（AtomGit 分发副本）`;
}

/** Release 正文：原样搬 + 顶部加一段本页说明 */
function buildBody(component, release, atomgitTag) {
  const header = [
    `> 本页是 **${component.label}** 在 AtomGit 的分发副本，版本 \`${release.tag_name}\`。`,
    `> 文件与原仓库 Release 逐字节相同，可直接用随附的 .md5 / .sha256 校验。`,
    `>`,
    `> 原始发布页：https://github.com/${component.repo}/releases/tag/${release.tag_name}`,
    ''
  ].join('\n');

  // 正文首行常是 GitHub 预览图的 Markdown 引用；那张图不随包同步，留着就是破图
  const original = (release.body || '').replace(/^\s*!\[[^\]]*\]\([^)]*\)\s*(\r?\n)+/, '');
  return `${header}\n${original}`.trimEnd() + '\n';
}

/**
 * 删掉 AtomGit 上某个 Release 里的同名资产。
 *
 * 为什么需要：AtomGit 的 OBS 回调不接受同名覆盖 —— 对已存在的文件名再 PUT 会得到
 * 203 + `Fail to read response body ... code:400`。所以「体积不一致要重传」这条路径
 * 必须先删后传。体积一致的情况走的是跳过分支，不会碰到这里。
 */
async function deleteAsset(atomgitTag, assetName) {
  const list = await atomgit(
    'GET',
    `/repos/${ATOMGIT_OWNER}/${ATOMGIT_REPO}/releases/tags/${encodeURIComponent(atomgitTag)}`,
    null,
    `查询 ${atomgitTag} 的资产以删除同名文件`
  );
  if (list.status !== 200 || !list.json) {
    throw new Error(`列 ${atomgitTag} 的资产失败：HTTP ${list.status}`);
  }
  const existing = (list.json.assets ?? []).find((a) => a.type === 'attach' && a.name === assetName);
  if (!existing) return false;

  const removed = await atomgit(
    'DELETE',
    `/repos/${ATOMGIT_OWNER}/${ATOMGIT_REPO}/releases/${encodeURIComponent(atomgitTag)}` +
      `/attach_files/${existing.id}?access_token=${encodeURIComponent(atomgitToken())}`,
    null,
    `删除旧资产 ${assetName}`
  );
  if (removed.status !== 204 && removed.status !== 200) {
    throw new Error(`删除旧资产 ${assetName} 失败：HTTP ${removed.status} ${removed.text.slice(0, 200)}`);
  }
  log(`    已删除 AtomGit 上的旧 ${assetName}（体积不一致，准备重传）`);
  return true;
}

/** 上传一个资产；调用方已确认它需要（重新）上传 */
async function uploadAsset(atomgitTag, asset, localPath) {
  const uploadUrlResponse = await atomgit(
    'GET',
    `/repos/${ATOMGIT_OWNER}/${ATOMGIT_REPO}/releases/${encodeURIComponent(atomgitTag)}/upload_url` +
      `?access_token=${encodeURIComponent(atomgitToken())}&file_name=${encodeURIComponent(asset.name)}`,
    null,
    `取上传地址 ${asset.name}`
  );
  if (uploadUrlResponse.status !== 200 || !uploadUrlResponse.json?.url) {
    throw new Error(
      `取 ${asset.name} 的上传地址失败：HTTP ${uploadUrlResponse.status} ${uploadUrlResponse.text.slice(0, 200)}`
    );
  }

  const { url, headers } = uploadUrlResponse.json;
  const size = statSync(localPath).size;
  // AtomGit 给的是 OBS 预签名 PUT：请求头必须原样带上，另外补 Content-Length
  const putHeaders = { ...headers, 'Content-Length': String(size) };

  /**
   * 一次性读进内存再 PUT，不用流。
   * 两个理由：① 流是「一次性」的，重试时那个流已经消耗完，第二次请求会直接抛
   * `Response body object should not be disturbed or locked` —— 一次网络抖动就会
   * 把整轮同步判死；Buffer 可以安全重放。② 实测用流 PUT 时 OBS 会挂很久（12 MB
   * 走了 11 分钟才回 502），换成 Buffer 后是秒级。
   * 产物最大约 95 MB，CI runner 内存足够。
   */
  const body = readFileSync(localPath);

  const putResponse = await request(
    url,
    { method: 'PUT', headers: putHeaders, body, timeoutMs: UPLOAD_TIMEOUT_MS },
    `上传 ${asset.name}`
  );
  if (putResponse.status !== 200) {
    const detail = await putResponse.text().catch(() => '');
    /**
     * 203 = OBS 回调失败。两种成因，处理方式不同：
     *
     *   · 「同名文件已存在」——文件早就在了，只是这一轮没认出来（比如清单没取到）。
     *   · 「Fail to call origin / obs_callback」——AtomGit 侧的回调超时，**文件其实已经写进 OBS**，
     *     只是元数据没登记完。并发上传时很常见（实测 4 路并发就会零星出现）。
     *
     * 两种都不该直接把版本判死：先回查一次实际状态。但回调是异步的，可能还没登记完，
     * 所以要等一会再查，并重试几次 —— 立刻查多半还是查不到，会把「其实已传好」误判成失败。
     */
    if (putResponse.status === 203) {
      for (let i = 0; i < CALLBACK_SETTLE_DELAYS_MS.length; i++) {
        await sleep(CALLBACK_SETTLE_DELAYS_MS[i]);
        if (await assetMatches(atomgitTag, asset.name, size)) {
          log(`    （${asset.name} 已写入 AtomGit，回调稍晚登记，按成功处理）`);
          return size;
        }
      }
    }
    throw new Error(`上传 ${asset.name} 失败：HTTP ${putResponse.status} ${detail.slice(0, 200)}`);
  }
  await putResponse.text().catch(() => {});
  return size;
}

/** 回查：AtomGit 上这个资产是不是已经是期望的体积 */
async function assetMatches(atomgitTag, assetName, expectedSize) {
  const list = await atomgit(
    'GET',
    `/repos/${ATOMGIT_OWNER}/${ATOMGIT_REPO}/releases/tags/${encodeURIComponent(atomgitTag)}`,
    null,
    `回查 ${assetName}`
  );
  if (list.status !== 200 || !list.json) return false;
  const hit = (list.json.assets ?? []).find((a) => a.type === 'attach' && a.name === assetName);
  return hit ? hit.size === expectedSize : false;
}

/**
 * 同步一个 Release。
 * 返回统计对象，调用方据此汇总与决定退出码。
 */
async function syncRelease(component, release, inventory) {
  const atomgitTag = `${component.prefix}${release.tag_name}`;
  const assets = assetsOf(release);
  log(`\n  ${component.key}  ${release.tag_name} → ${atomgitTag}`);

  if (!assets.length) {
    log('    该 Release 没有可下载资产，跳过');
    return { tag: atomgitTag, uploaded: [], skipped: [], status: 'no-assets' };
  }

  // AtomGit 上已有的资产体积（inventory 可能为 null）
  const known = inventory?.get(atomgitTag)?.assets ?? null;

  const body = buildBody(component, release, atomgitTag);
  /**
   * ⚠️ 必须先建 Release 才能传资产（upload_url 以 Release 存在为前提），
   * 但「先建后传」有个副作用：资产全部失败时会留下一个只有校验文件、没有安装包的
   * 「空壳 Release」。前端判断某版本「有没有」只看清单里有没有这个 tag，
   * 于是会把用户导到一个 404 直链 —— 比完全没有这个版本更糟。
   * 本地实测已踩出 8 个这样的空壳。
   *
   * 对策是**回滚**：记录这个 tag 是不是本轮新建的，如果本轮一个资产都没传成，
   * 就把刚建的 Release 撤掉（删 tag 会连带删掉 Release），让这个版本回到「还没出现」。
   */
  const isNewRelease = (await ensureAtomgitRelease(component, release, atomgitTag, body)) === 'created';

  const uploaded = [];
  const skipped = [];

  // 先分类：能跳过的直接记账，剩下的才进并发队列
  const pending = [];
  for (const asset of assets) {
    const existingSize = known?.get(asset.name);
    if (existingSize === asset.size) {
      log(`    跳过 ${asset.name}（AtomGit 上已有，体积一致）`);
      skipped.push(asset.name);
      continue;
    }

    if (DRY_RUN) {
      const why =
        existingSize === undefined
          ? inventory
            ? 'AtomGit 上还没有'
            : '无法确认（未取到 AtomGit 清单）'
          : `体积不符（${mb(existingSize)} → ${mb(asset.size)}）`;
      log(`    [dry-run] 将上传 ${asset.name}（${mb(asset.size)}，${why}）`);
      uploaded.push(asset.name);
      continue;
    }

    pending.push({ asset, existingSize });
  }

  /**
   * 处理待传资产。
   *
   * 这里**不再自己开并发池**：真正的限流在全局闸门 withUploadSlot 里，
   * 版本级并发负责把多个版本的重叠起来。两层池子相乘会把并发放大到 16，
   * 远超实测拐点；只留一层闸门，语义也更清楚。
   *
   * 单个资产失败只记失败、不影响同一批其它资产 —— 历史回填动辄几十个文件，
   * 一个坏包不该把整轮拖停。失败会在汇总里体现，下一轮自动重试。
   */
  const failures = [];

  for (const { asset, existingSize } of pending) {
    const dest = join(WORK_DIR, `${component.key}__${atomgitTag}__${asset.name}`);
    try {
      log(`    下载 ${asset.name}（${mb(asset.size)}）…`);
      await downloadAsset(asset, dest);

      // 体积对得上不代表内容对得上：GitHub 给了 digest 就必须核一遍
      const digest = verifyDigest(asset, dest);
      if (digest.checked) log(`    内容校验通过（sha256 与 GitHub 一致）`);

      // 删除 + 上传在同一把锁里完成：同名文件必须先删后传，
      // 中间若被别的版本插进来抢到同名位置就会互相踩。
      const sent = await withUploadSlot(async () => {
        if (existingSize !== undefined) await deleteAsset(atomgitTag, asset.name);
        log(`    上传 ${asset.name} …`);
        return uploadAsset(atomgitTag, asset, dest);
      });
      uploaded.push(asset.name);
      log(`    ✓ ${asset.name} 已上传（${mb(sent)}）`);
    } catch (error) {
      failures.push(`${asset.name}: ${error.message}`);
      warn(`${asset.name} 失败：${error.message}`);
    } finally {
      // 大文件不留在临时目录里占空间
      if (existsSync(dest)) rmSync(dest, { force: true });
    }
  }

  if (failures.length) {
    // 本轮新建的 Release 一个资产都没传成 → 撤掉，别留空壳（见上面 isNewRelease 的注释）
    if (isNewRelease && !uploaded.length) {
      await rollbackRelease(atomgitTag);
    }
    throw new Error(`${failures.length} 个资产失败：${failures.join('；')}`);
  }

  return { tag: atomgitTag, uploaded, skipped, status: uploaded.length ? 'synced' : 'up-to-date' };
}

/**
 * 撤销一个「空壳」Release。
 * AtomGit 没有删除 Release 的接口（DELETE /releases/:tag 返回 405），
 * 但删掉同名 tag 会连带删掉挂在它上面的 Release，所以走删 tag。
 */
async function rollbackRelease(atomgitTag) {
  const removed = await atomgit(
    'DELETE',
    `/repos/${ATOMGIT_OWNER}/${ATOMGIT_REPO}/tags/${encodeURIComponent(atomgitTag)}?access_token=${encodeURIComponent(atomgitToken())}`,
    null,
    `撤销空壳 Release ${atomgitTag}`
  );
  if (removed.status === 200 || removed.status === 204) {
    warn(`已撤销空壳 Release ${atomgitTag}（本轮没有任何资产传成功，避免前端指向 404）`);
  } else {
    warn(`撤销空壳 Release ${atomgitTag} 失败：HTTP ${removed.status}`);
  }
}

/* ── 主流程 ───────────────────────────────────────────────────────── */

async function main() {
  if (!DRY_RUN && !atomgitToken()) {
    fail('缺少 ATOMGIT_TOKEN：同步需要 AtomGit 访问令牌（仓库 Secret）。只想看要做什么请加 --dry-run。');
    return;
  }

  const components = ONLY_REPO
    ? COMPONENTS.filter((c) => c.key === ONLY_REPO)
    : COMPONENTS;
  if (!components.length) {
    fail(`--repo=${ONLY_REPO} 不认识，可选：${COMPONENTS.map((c) => c.key).join(' / ')}`);
    return;
  }

  mkdirSync(WORK_DIR, { recursive: true });

  log('AtomGit 分发同步');
  log(`  组件：${components.map((c) => c.key).join(', ')}`);
  const scope = ONLY_TAG
    ? `tag ${ONLY_TAG}`
    : SYNC_ALL
      ? '全部 Release'
      : '每个仓库最新版';
  const channel = ONLY_STABLE ? '（仅正式版）' : ONLY_PRERELEASE ? '（仅预览版）' : '';
  log(`  范围：${scope}${channel}`);
  log(`  模式：${DRY_RUN ? '预演（不改远端）' : '实际写入'}`);

  // 先一次性取回 AtomGit 现状：省掉每个资产一次查询，也顺带把限流风险集中到一处。
  // 预演也要取 —— 不取的话「已同步」会被误报成「尚不存在」，预演就失去了意义。
  // 没有令牌时（只加 --dry-run、没配 secret 的场景）退回 null，按「全都没传过」估个上限。
  const inventory = atomgitToken() ? await fetchAtomgitInventory() : null;

  // 记下开跑前谁被标成 latest，跑完还原（见 restoreLatestFlag 的注释）
  if (atomgitToken()) PRE_RUN_LATEST = await captureLatest();

  const results = [];
  for (const component of components) {
    component.label = labelOf(component.key);
    log(`\n[${component.key}] ${component.repo}`);

    let releases;
    try {
      releases = await listGithubReleases(component.repo);
    } catch (error) {
      fail(`取 ${component.repo} 的 Release 列表失败：${error.message}`);
      continue;
    }

    if (!releases.length) {
      warn(`${component.repo} 没有任何已发布的 Release`);
      continue;
    }

    // 默认只同步最新的：老版本推上去也没人下，还占空间、拖慢每一轮
    let target = releases;
    if (ONLY_TAG) {
      target = releases.filter((r) => r.tag_name === ONLY_TAG);
      if (!target.length) {
        warn(`${component.repo} 里没有 tag ${ONLY_TAG}`);
        continue;
      }
    } else if (!SYNC_ALL) {
      target = releases.slice(0, 1);
      // 通道过滤在「取最新一条」之后 —— 否则 --stable-only 时最新那条若是预览版，
      // 会被过滤成空列表，看起来像「这个仓库没有版本」。
      if (ONLY_STABLE) target = target.filter((r) => !r.prerelease);
      if (ONLY_PRERELEASE) target = target.filter((r) => r.prerelease);
      if (!target.length) {
        warn(`${component.repo} 在所选通道下没有版本`);
        continue;
      }
    } else {
      /**
       * 回填历史（--all）。先同步正式版、再同步预发布版：
       * 总量很大（三端合计约 4 GB），中途被打断时先拿到手的是能直接给用户装的正式版，
       * 而不是一堆 insider 预览包。
       */
      target = [...releases].sort((a, b) => Number(a.prerelease) - Number(b.prerelease));
      if (ONLY_STABLE) target = target.filter((r) => !r.prerelease);
      if (ONLY_PRERELEASE) target = target.filter((r) => r.prerelease);
      if (!target.length) {
        warn(`${component.repo} 在所选通道下没有版本`);
        continue;
      }
    }

    // 并发跑多个版本（见 CONCURRENCY 的注释）。每个版本内部仍是串行的，
    // 所以不会出现「同一个 release 里先删后传互相踩」。
    if (CONCURRENCY > 1 && target.length > 1) {
      log(`  并发 ${CONCURRENCY} 个版本`);
      const queue = [...target];
      const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (;;) {
          const release = queue.shift();
          if (!release) return;
          try {
            results.push({ component: component.key, ...(await syncRelease(component, release, inventory)) });
          } catch (error) {
            // 单个版本失败不中断整轮：历史回填动辄几十个版本，一个坏版本不该让后面全停下
            fail(`同步 ${component.key} ${release.tag_name} 失败：${error.message}`);
          }
        }
      });
      await Promise.all(workers);
    } else {
      for (const release of target) {
        try {
          results.push({ component: component.key, ...(await syncRelease(component, release, inventory)) });
        } catch (error) {
          // 单个版本失败不中断整轮：历史回填动辄几十个版本，一个坏版本不该让后面全停下
          fail(`同步 ${component.key} ${release.tag_name} 失败：${error.message}`);
        }
      }
    }
  }

  /* ── 汇总 ───────────────────────────────────────────────────────── */

  const synced = results.filter((r) => r.status === 'synced');
  const upToDate = results.filter((r) => r.status === 'up-to-date');
  const noAssets = results.filter((r) => r.status === 'no-assets');

  log('\n── 汇总 ──');
  log(`  已同步：${synced.length}`);
  for (const r of synced) log(`    ${r.tag}：上传 ${r.uploaded.join(', ')}`);
  log(`  已是最新：${upToDate.length}`);
  for (const r of upToDate) log(`    ${r.tag}`);
  if (noAssets.length) {
    log(`  无资产：${noAssets.length}`);
    for (const r of noAssets) log(`    ${r.tag}`);
  }

  if (DRY_RUN) log('\n（预演结束，未改动 AtomGit）');
  else await restoreLatestFlag();
}

/**
 * 把 AtomGit 的「最新版本」标记还原到本该属于它的那条。
 *
 * ⚠️ 为什么需要：AtomGit 的 `GET /releases/latest` **不读 release_status**，
 * 而是按创建时间取最新的一条。回填历史版本时，最后建的那条（比如某个 insider 预览版）
 * 会顶掉正式版成为「最新」，AtomGit 首页就指向一个预览版。
 *
 * 对策：记下开跑前谁被标成 latest（并确认它确实存在），跑完再把那条 PATCH 一次。
 * PATCH 会刷新它的状态标记，实测能让 /latest 回到正确的那条。
 * 找不到原 latest 时不动 —— 宁可不修，也不猜一个「最新」出来。
 */
async function restoreLatestFlag() {
  if (!PRE_RUN_LATEST) return;
  const { tag, name, body } = PRE_RUN_LATEST;
  const current = await atomgit(
    'GET',
    `/repos/${ATOMGIT_OWNER}/${ATOMGIT_REPO}/releases/latest`,
    null,
    '读取当前 latest'
  ).catch(() => null);
  if (current && current.json?.tag_name === tag) {
    log(`\nlatest 仍指向 ${tag}，无需恢复`);
    return;
  }
  const patched = await atomgit(
    'PATCH',
    `/repos/${ATOMGIT_OWNER}/${ATOMGIT_REPO}/releases/${encodeURIComponent(tag)}?access_token=${encodeURIComponent(atomgitToken())}`,
    { tag_name: tag, name, body, release_status: 'latest' },
    `恢复 latest 标记到 ${tag}`
  ).catch((error) => {
    warn(`恢复 latest 标记失败：${error.message}（不影响资产，下次同步会再试）`);
    return null;
  });
  if (patched && patched.status === 200) log(`\n已把 latest 标记恢复到 ${tag}`);
}

/**
 * 开跑前被标成 latest 的那条（tag / name / body），跑完用来还原。
 * 取不到就是 null，restoreLatestFlag 会直接跳过 —— 不猜一个「最新」出来。
 */
let PRE_RUN_LATEST = null;

async function captureLatest() {
  const latest = await atomgit(
    'GET',
    `/repos/${ATOMGIT_OWNER}/${ATOMGIT_REPO}/releases/latest`,
    null,
    '记录开跑前的 latest'
  ).catch(() => null);
  const tag = latest?.json?.tag_name;
  if (!tag) return null;
  // 只在它确实被标成 latest 时才接管：否则说明本来就没有明确的「最新」，不该由我们指定
  if (latest.json?.release_status && latest.json.release_status !== 'latest') return null;
  return { tag, name: latest.json.name || tag, body: latest.json.body || '' };
}

function labelOf(key) {
  return { desktop: '桌面版（WinUI 3）', win7: '桌面版（Windows 7）', android: 'Android 客户端' }[key] ?? key;
}

/**
 * 只在被当作脚本直接执行时跑主流程。
 * 被 import 时（测试、或将来别的脚本要复用 uploadAsset）不自动执行 ——
 * 否则一次 import 就会去改远端。
 */
const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === (await import('node:path')).resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((error) => {
    fail(`未捕获异常：${error.stack || error.message}`);
  });
}

export { COMPONENTS, SKIP_ASSET_RE, assetsOf, buildBody, atomgitName, uploadAsset, deleteAsset, assetMatches, ensureAtomgitRelease, downloadAsset, syncRelease, fetchAtomgitInventory };
