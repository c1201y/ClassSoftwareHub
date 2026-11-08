#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════
//  部署后主动通知搜索引擎：IndexNow
//
//  【为什么需要】
//  本站是 hash 路由单页应用，能提交的 URL 只有首页一条（见 AGENTS.md
//  「SEO & the share card」）。Bing / Yandex / Seznam 等支持 IndexNow 的引擎
//  收到推送后通常几分钟内就会重抓；不推的话只能等 sitemap 的定期巡检，
//  内容更新要拖几天到几周才反映到搜索结果里。
//
//  【key 从哪来】
//  public/<key>.txt 里的文件名就是 key，内容也是这个 key。
//  协议要求这两个东西一致，且文件必须能公开访问 —— 引擎会先 GET 它来确认
//  你确实控制着这个域名。所以 key 不是秘密，它就是公开的验证凭据。
//
//  【失败了要怎样】
//  只警告，不失败。这是纯锦上添花的通知：站点本身早已部署成功，
//  让一次 IndexNow 的 5xx 把整次部署染红，会把真正的故障淹掉。
//
//  【用法】
//      node scripts/indexnow.mjs              # 推送首页
//      node scripts/indexnow.mjs https://...  # 推送指定 URL
//  ⚠️ 只推主域名 classsoftwarehub.cn 的地址，别把镜像域名推进去。
// ══════════════════════════════════════════════════════════════════════

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const HOST = 'https://classsoftwarehub.cn';

// 公钥端点：所有支持 IndexNow 的引擎共用这一个，推一次就够。
const ENDPOINT = 'https://api.indexnow.org/indexnow';

/** 在 public/ 里找 <32 位 hex>.txt 形式的验证文件，返回其中的 key。 */
function findKey() {
  const candidates = readdirSync(PUBLIC).filter((f) => /^[a-f0-9]{32}\.txt$/i.test(f));
  if (candidates.length === 0) {
    throw new Error(
      `public/ 下没有 IndexNow 验证文件（应为 <32位hex>.txt）。` +
        `去 https://www.bing.com/indexnow/getstarted 生成一个，` +
        `文件名用 key 本身，内容也写 key。`
    );
  }
  if (candidates.length > 1) {
    console.warn(`⚠️ public/ 下有多个候选 key，只用第一个：${candidates[0]}`);
  }
  const file = candidates[0];
  const key = readFileSync(join(PUBLIC, file), 'utf8').trim();
  const fromName = file.replace(/\.txt$/i, '');
  if (key !== fromName) {
    throw new Error(`${file} 的内容（${key}）与文件名（${fromName}）不一致，IndexNow 会拒绝。`);
  }
  return key;
}

async function main() {
  const key = findKey();
  const urls = process.argv.slice(2).filter((a) => a.startsWith('http'));
  if (urls.length === 0) urls.push(`${HOST}/`);

  const offHost = urls.filter((u) => !u.startsWith(HOST));
  if (offHost.length) {
    console.warn(`⚠️ 以下 URL 不属于主域名 ${HOST}，已跳过：\n  ${offHost.join('\n  ')}`);
  }
  const target = urls.filter((u) => u.startsWith(HOST));
  if (target.length === 0) {
    console.log('没有可推送的 URL，跳过。');
    return;
  }

  const payload = {
    host: new URL(HOST).host,
    key,
    keyLocation: `${HOST}/${key}.txt`,
    urlList: target,
  };

  console.log(`IndexNow：推送 ${target.length} 条 URL 到 ${new URL(ENDPOINT).host}`);
  for (const u of target) console.log(`  · ${u}`);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });

    // 200 = 已接受；202 = 已接受但 key 还在校验中。两者都算成功。
    if (res.status === 200 || res.status === 202) {
      console.log(`✅ IndexNow 已接受（HTTP ${res.status}）`);
    } else {
      const body = await res.text().catch(() => '');
      console.warn(`⚠️ IndexNow 返回 HTTP ${res.status}：${body.slice(0, 300)}`);
      console.warn('   （不影响部署：这只影响搜索引擎多快重抓）');
    }
  } catch (err) {
    // 网络不通同样只警告：本脚本在很多地区会被墙，不该让部署变红。
    console.warn(`⚠️ IndexNow 推送失败：${err.message}`);
    console.warn('   （不影响部署：站点已经发布完成）');
  }
}

main().catch((err) => {
  console.warn(`⚠️ indexnow.mjs：${err.message}`);
  console.warn('   （不影响部署）');
});
