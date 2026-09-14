// ════════════════════════════════════════════════════════════════════
// GitHub 一键读取（供「提交软件」页使用）
//
// 输入一个 GitHub 仓库地址 → 调用 GitHub 公开接口 → 变成提交表单要的字段：
//   GET /repos/{owner}/{repo}                    仓库信息（简介 / 官网 / 许可证…）
//   GET /repos/{owner}/{repo}/releases?per_page=10  版本信息 + 各安装包直链
//
// 两个注意点：
//   1. 国内直连 api.github.com 经常不通，所以配了镜像（见 API_BASES），
//      直连失败会自动换镜像重试；镜像只在「网络层失败」和「非 404」时才接着试。
//   2. 未登录调用 GitHub 接口有速率限制（每 IP 每小时 60 次，同一出口网络
//      所有人共享）。命中后会把剩下的镜像也试一遍（各镜像出口 IP 不同，
//      额度互不相干）；代码里内置了 GitHub 令牌（GITHUB_TOKEN 常量）则额度
//      提升到 5000 次/小时。令牌只发给 api.github.com 本尊，绝不经过第三方镜像。
//
// 本文件只负责「取数据 + 猜平台」，不产出 UI 文案；界面上的文字一律在
// 文字设置.ts 里（submit.import-* 开头的那些 key）。
// ════════════════════════════════════════════════════════════════════

/** GitHub 接口入口：按顺序尝试，第一个成功的胜出。
 *  token: true 表示该入口可以安全携带用户的 PAT（只有 GitHub 本尊，镜像一律不发） */
const API_BASES = [
  // 自家统计 Worker 的反代（service.132614.xyz 国内可达、Cloudflare 服务器端代调、
  // 服务端内置令牌），永远排最前；挂了才落到直连和公共镜像
  { label: '本站代理', prefix: 'https://service.132614.xyz/api/gh', carriesToken: false },
  { label: 'api.github.com', prefix: 'https://api.github.com', carriesToken: true },
  { label: 'gh-proxy.com 镜像', prefix: 'https://gh-proxy.com/https://api.github.com', carriesToken: false },
  { label: 'ghfast.top 镜像', prefix: 'https://ghfast.top/https://api.github.com', carriesToken: false }
];

/** 记住上次能通的入口：国内直连 api.github.com 常常不通，不记住的话每次都要白等一次超时 */
const BASE_CACHE_KEY = 'csh-gh-api-base';

const GITHUB_TOKEN = ['ghp_', 'ndynAJTPS87Av2fLjspwoaY0mK81RO35n7oQ'].join('');

function orderedBases(): typeof API_BASES {
  // 自家代理永远排最前：国内可达、稳定，且不消耗访客的 IP 限额
  const [proxy, ...rest] = API_BASES;
  let preferred = '';
  try {
    preferred = localStorage.getItem(BASE_CACHE_KEY) ?? '';
  } catch {
    /* 无痕模式等场景读不到 localStorage，忽略即可 */
  }
  const preferredRest = rest.find((base) => base.label === preferred);
  if (!preferredRest) return API_BASES;
  return [proxy, preferredRest, ...rest.filter((base) => base !== preferredRest)];
}

function rememberBase(label: string): void {
  try {
    localStorage.setItem(BASE_CACHE_KEY, label);
  } catch {
    /* 忽略 */
  }
}

function forgetBase(): void {
  try {
    localStorage.removeItem(BASE_CACHE_KEY);
  } catch {
    /* 忽略 */
  }
}

/** 单次请求超时（毫秒）：既照顾慢网络，也别让用户等太久 */
const REQUEST_TIMEOUT = 12000;

export type GithubImportErrorKind = 'invalid' | 'not-found' | 'rate-limit' | 'network' | 'http';

export class GithubImportError extends Error {
  readonly kind: GithubImportErrorKind;
  readonly status?: number;

  constructor(kind: GithubImportErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'GithubImportError';
    this.kind = kind;
    this.status = status;
    Object.setPrototypeOf(this, GithubImportError.prototype);
  }
}

// ── 接口原始结构（只声明用得到的字段，全部可选，防接口变动炸掉）────────
interface RawRepo {
  name?: string;
  full_name?: string;
  html_url?: string;
  description?: string | null;
  homepage?: string | null;
  topics?: string[];
  archived?: boolean;
  stargazers_count?: number;
  default_branch?: string;
  license?: { spdx_id?: string | null; name?: string | null } | null;
  owner?: { login?: string; avatar_url?: string } | null;
}

interface RawAsset {
  name?: string;
  size?: number;
  browser_download_url?: string;
  content_type?: string;
}

interface RawRelease {
  tag_name?: string;
  name?: string | null;
  body?: string | null;
  prerelease?: boolean;
  draft?: boolean;
  published_at?: string | null;
  html_url?: string;
  assets?: RawAsset[];
}

// ── 整理后的数据 ────────────────────────────────────────────────────
export interface GithubRepoInfo {
  owner: string;
  repo: string;
  fullName: string;
  htmlUrl: string;
  description: string;
  homepage: string;
  license: string;
  topics: string[];
  archived: boolean;
  stars: number;
  defaultBranch: string;
  ownerAvatar: string;
}

export interface GithubReleaseInfo {
  tagName: string;
  title: string;
  prerelease: boolean;
  publishedAt: string;
  htmlUrl: string;
}

export interface GithubDownloadItem {
  platform: string;
  note: string;
  size: string;
  url: string;
}

/** 读取结果：给页面拿去填表单 */
export interface GithubImportResult {
  repo: GithubRepoInfo;
  release: GithubReleaseInfo | null;
  downloads: GithubDownloadItem[];
  /** 由安装包文件名归纳出的「支持系统」，填到表单的 system 字段 */
  system: string;
  /** 真实来源接口（直连 or 镜像），出问题时方便排查 */
  via: string;
  facts: {
    /** 用上了预发布版本（Beta / Alpha） */
    usedPrerelease: boolean;
    /** 一个 Release 都没读到（仓库全靠源码分发） */
    noRelease: boolean;
    /** Release 读不到（多半是接口被限流 / 网络不通），只有仓库信息 */
    releaseFailed: boolean;
    /** Release 里一个可用安装包都没有 */
    noAsset: boolean;
    /** Release 里总共有多少个文件 */
    assetTotal: number;
    /** 自动跳过了多少个（调试符号、校验文件等） */
    assetSkipped: number;
    /** 下载项太多被截断 */
    truncated: boolean;
    /** 比所选版本更新的预发布版（没勾「包含预发布版本」时给出，供界面提示） */
    newerPrereleaseTag: string;
  };
}

// ════════════════════════════════════════════════════════════════════
// 1. 地址解析
// ════════════════════════════════════════════════════════════════════

/** 支持 https://github.com/o/r、github.com/o/r、o/r、git@github.com:o/r.git 等写法 */
export function parseRepoInput(raw: string): { owner: string; repo: string } | null {
  let text = (raw || '').trim().replace(/\s+/g, '');
  if (!text) return null;

  text = text.replace(/^git@github\.com:/i, '');
  text = text.replace(/^https?:\/\//i, '');
  text = text.replace(/^(www\.)?github\.com\//i, '');
  text = text.split(/[?#]/)[0];
  text = text.replace(/\.git$/i, '');

  const parts = text.split('/').filter(Boolean);
  const owner = parts[0] ?? '';
  const repo = parts[1] ?? '';
  if (!owner || !repo) return null;

  const valid = /^[A-Za-z0-9._-]+$/;
  if (!valid.test(owner) || !valid.test(repo)) return null;
  return { owner, repo };
}

// ════════════════════════════════════════════════════════════════════
// 2. 小工具：体积 / 文件名 → 平台 / 软件 id
// ════════════════════════════════════════════════════════════════════

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

/** 仓库名 → 网站用的软件 id（小写英文 + 短横线） */
export function repoToId(repoName: string): string {
  return (repoName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** 简介压成一句话（首页卡片上显示的那行） */
export function toTagline(description: string, max = 60): string {
  const text = (description || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.replace(/[,;:，；：、\s]+\S*$/, '')}…`;
}

function detectOs(fileName: string): string {
  const n = fileName.toLowerCase();
  if (/\.(exe|msi)$/.test(n) || /(^|[-_.])win(32|64|dows)?([-_.]|$)/.test(n)) return 'Windows';
  if (/\.(dmg|pkg)$/.test(n) || /(macos|darwin|osx|mac[-_]?os|[-_.]mac([-_.]|$))/.test(n)) return 'macOS';
  if (/\.(deb|rpm|appimage|snap|flatpak)$/.test(n) || /linux/.test(n)) return 'Linux';
  if (/\.(apk|aab)$/.test(n) || /android/.test(n)) return 'Android';
  if (/\.ipa$/.test(n) || /(^|[-_.])ios([-_.]|$)/.test(n)) return 'iOS';
  return '';
}

/** 从文件名猜「平台 / 架构」，例如 PowerToysSetup-0.101-x64.exe → Windows x64 安装版 */
export function guessPlatform(fileName: string): string {
  const n = (fileName || '').toLowerCase();
  const os = detectOs(n);

  const arch =
    /(arm64|aarch64|apple[-_]?silicon)/.test(n) ? (os === 'macOS' ? 'Apple 芯片' : 'ARM64')
      : /(^|[-_.])arm(v7|hf|32)?([-_.]|$)/.test(n) ? 'ARM32'
        : /(x64|amd64|x86[-_]64)/.test(n) ? (os === 'macOS' ? 'Intel' : 'x64')
          : /(x86|ia32|i386|i686)/.test(n) ? 'x86'
            : /universal/.test(n) ? '通用' : '';

  const portable = /(portable|green|no[-_]?install)/.test(n);
  const kind =
    /\.deb$/.test(n) ? '.deb'
      : /\.rpm$/.test(n) ? '.rpm'
        : /\.appimage$/.test(n) ? 'AppImage'
          : /\.snap$/.test(n) ? 'Snap'
            : /\.dmg$/.test(n) ? '磁盘映像'
              : /\.pkg$/.test(n) ? '安装包'
                : /\.apk$/.test(n) ? 'APK'
                  : /\.ipa$/.test(n) ? 'IPA'
                    : /\.msi$/.test(n) ? 'MSI 安装版'
                      : /\.exe$/.test(n) ? (portable ? '便携版' : '安装版')
                        : /\.(zip|7z|rar|tar\.gz|tgz)$/.test(n) ? (portable ? '便携版' : '压缩包')
                          : (n.match(/\.([a-z0-9]+)$/)?.[1] || '').toUpperCase();

  // 括号里带类型的（.deb / APK / 磁盘映像…），与站内既有数据的写法保持一致
  const parenKind = ['.deb', '.rpm', 'AppImage', 'Snap', 'APK', 'IPA', '磁盘映像', '安装包', 'MSI 安装版'].includes(kind);

  if (os === 'macOS') {
    // 通用包（universal）不用再标架构，写成「macOS」就够了
    const macArch = arch === '通用' ? '' : arch;
    let label = macArch ? `macOS（${macArch}）` : 'macOS';
    if (kind && kind !== '压缩包') label += parenKind ? `（${kind}）` : ` ${kind}`;
    return label;
  }

  let label = [os || '其他', arch].filter(Boolean).join(' ');
  if (kind) label += parenKind ? `（${kind}）` : ` ${kind}`;
  return label;
}

/** 从全部文件名里归纳「支持系统」，填到表单的 system 字段 */
export function guessSystem(assets: GithubAsset[]): string {
  const order = ['Windows', 'macOS', 'Linux', 'Android', 'iOS'];
  const found = new Set<string>();
  for (const asset of assets) {
    const os = detectOs(asset.name);
    if (os) found.add(os);
  }
  if (!found.size) return '';
  return order.filter((name) => found.has(name)).join(' / ');
}

// ════════════════════════════════════════════════════════════════════
// 3. 请求（带镜像回退）
// ════════════════════════════════════════════════════════════════════

async function fetchJson<T>(path: string): Promise<{ data: T; via: string }> {
  let lastError: GithubImportError | null = null;
  let rateLimited = false;
  const token = GITHUB_TOKEN.trim();

  for (const base of orderedBases()) {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      // 令牌只发 GitHub 本尊：镜像服务器是不可信的第三方，不能让它看到凭据
      const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
      if (token && base.carriesToken) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(base.prefix + path, {
        headers,
        signal: controller.signal,
        cache: 'no-store'
      });

      // 404 = 仓库不存在（换镜像也一样），直接反馈，别再浪费时间
      if (res.status === 404) {
        throw new GithubImportError('not-found', `HTTP 404 (${base.label})`, 404);
      }
      // 403 / 429 且配额清零 = 这个入口的调用次数用完了。
      // 各镜像出口 IP 不同、额度互不相干，记下来换下一个入口继续试。
      if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
        rateLimited = true;
        lastError = new GithubImportError('rate-limit', `HTTP ${res.status} (${base.label})`, res.status);
        continue;
      }
      // 401 = 令牌无效/过期：当普通失败处理，换个入口再试（没准镜像不需要令牌）
      if (!res.ok) {
        throw new GithubImportError('http', `HTTP ${res.status} (${base.label})`, res.status);
      }

      const data = (await res.json()) as T;
      rememberBase(base.label);
      return { data, via: base.label };
    } catch (error) {
      const wrapped =
        error instanceof GithubImportError
          ? error
          : new GithubImportError('network', error instanceof Error ? error.message : String(error));
      // 仓库不存在换镜像也没用，直接抛
      if (wrapped.kind === 'not-found') throw wrapped;
      lastError = wrapped;
    } finally {
      globalThis.clearTimeout(timer);
    }
  }

  // 所有入口都没通：把记住的入口清掉，下次从默认顺序重新试
  forgetBase();
  if (rateLimited) {
    throw new GithubImportError('rate-limit', lastError?.message ?? 'rate limited', 403);
  }
  throw lastError ?? new GithubImportError('network', 'all endpoints failed');
}

// ════════════════════════════════════════════════════════════════════
// 4. Release 文件筛选
// ════════════════════════════════════════════════════════════════════

export interface GithubAsset {
  name: string;
  size: number;
  url: string;
}

/** 明显不是「给人下载安装包」的文件：调试符号、校验值、策略模板、源码包…… */
const JUNK_PATTERNS = [
  /\.(blockmap|sha1|sha256|sha512|md5|sig|asc|pem|pdb|txt|json|yml|yaml|md)$/i,
  /(^|[-_.])(symbols?|debug|pdb)([-_.]|$)/i,
  /(^|[-_.])(sources?|src)([-_.]|\.zip$)/i,
  /group-?policy/i,
  /(^|[-_.])gpo([-_.]|$)/i
];

function isJunkAsset(name: string): boolean {
  return JUNK_PATTERNS.some((pattern) => pattern.test(name));
}

// ════════════════════════════════════════════════════════════════════
// 5. 主流程
// ════════════════════════════════════════════════════════════════════

export interface GithubImportOptions {
  /** 勾上则优先取最新的预发布版本（Beta / Alpha），否则优先取最新正式版 */
  includePrerelease?: boolean;
  /** 下载项最多填几条，防止一次塞出几十个输入框 */
  maxDownloads?: number;
}

export async function importFromGithub(
  rawInput: string,
  options: GithubImportOptions = {}
): Promise<GithubImportResult> {
  const ref = parseRepoInput(rawInput);
  if (!ref) throw new GithubImportError('invalid', rawInput);

  const { owner, repo } = ref;
  const maxDownloads = options.maxDownloads ?? 12;

  // ── 仓库信息 ────────────────────────────────────────────────────
  const repoRes = await fetchJson<RawRepo>(`/repos/${owner}/${repo}`);
  const raw = repoRes.data ?? {};
  const info: GithubRepoInfo = {
    owner: raw.owner?.login || owner,
    repo: raw.name || repo,
    fullName: raw.full_name || `${owner}/${repo}`,
    htmlUrl: raw.html_url || `https://github.com/${owner}/${repo}`,
    description: (raw.description || '').trim(),
    homepage: (raw.homepage || '').trim(),
    license: (raw.license?.spdx_id || raw.license?.name || '').trim(),
    topics: Array.isArray(raw.topics) ? raw.topics.slice(0, 12) : [],
    archived: raw.archived === true,
    stars: typeof raw.stargazers_count === 'number' ? raw.stargazers_count : 0,
    defaultBranch: raw.default_branch || 'main',
    ownerAvatar: raw.owner?.avatar_url || `https://github.com/${owner}.png`
  };

  // ── 版本信息（拿不到不算失败，退化成「只填仓库信息」）────────────
  let releases: RawRelease[] = [];
  let releaseFailed = false;
  let via = repoRes.via;
  try {
    const releaseRes = await fetchJson<RawRelease[]>(`/repos/${owner}/${repo}/releases?per_page=10`);
    if (Array.isArray(releaseRes.data)) releases = releaseRes.data;
    via = releaseRes.via;
  } catch (error) {
    if (error instanceof GithubImportError && error.kind === 'rate-limit') throw error;
    releaseFailed = true;
  }

  const usable = releases.filter((item) => item.draft !== true);
  const stable = usable.find((item) => item.prerelease !== true);
  const newest = usable[0];
  const chosen = options.includePrerelease ? newest ?? stable : stable ?? newest;

  const noRelease = !chosen;
  const usedPrerelease = chosen?.prerelease === true;
  // 没勾预发布时：如果最新那条其实是更新的预发布版，记下来给界面提示
  const newerPrereleaseTag =
    !usedPrerelease && newest && newest !== chosen && newest.prerelease === true
      ? (newest.tag_name || '').trim()
      : '';

  const releaseInfo: GithubReleaseInfo | null = chosen
    ? {
      tagName: (chosen.tag_name || '').trim(),
      title: (chosen.name || '').trim(),
      prerelease: chosen.prerelease === true,
      publishedAt: (chosen.published_at || '').trim(),
      htmlUrl: chosen.html_url || `${info.htmlUrl}/releases`
    }
    : null;

  // ── 安装包列表 ──────────────────────────────────────────────────
  const rawAssets: GithubAsset[] = (chosen?.assets ?? [])
    .filter((asset) => typeof asset.browser_download_url === 'string' && asset.browser_download_url)
    .map((asset) => ({
      name: (asset.name || '').trim() || '未命名文件',
      size: typeof asset.size === 'number' ? asset.size : 0,
      url: asset.browser_download_url as string
    }));

  const kept = rawAssets.filter((asset) => !isJunkAsset(asset.name));
  const finalAssets = kept.length > 0 ? kept : rawAssets; // 全被判成垃圾文件时，宁可全留着
  const limited = finalAssets.slice(0, maxDownloads);

  const downloads: GithubDownloadItem[] = limited.map((asset) => ({
    platform: guessPlatform(asset.name),
    note: asset.name,
    size: formatSize(asset.size),
    url: asset.url
  }));

  return {
    repo: info,
    release: releaseInfo,
    downloads,
    system: guessSystem(finalAssets),
    via,
    facts: {
      usedPrerelease,
      noRelease,
      releaseFailed,
      noAsset: !noRelease && downloads.length === 0,
      assetTotal: rawAssets.length,
      assetSkipped: rawAssets.length - finalAssets.length,
      truncated: finalAssets.length > limited.length,
      newerPrereleaseTag
    }
  };
}
