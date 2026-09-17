// ════════════════════════════════════════════════════════════════════
// 软件图标的「本地兜底」表
//
// 背景：软件数据里的 icon 大多写着外部图片地址（各软件官网 / 图床）。
// 其中挂在 GitHub（avatars / raw / github.com/.../raw/...）和 jsDelivr
// 上的那几张，在国内网络下经常加载不出来 —— 卡片上就开天窗了。
//
// 解决办法：把这些「国内不稳」的图标预先下载好、压成 64px 的小图，
// 放在 src/assets/icons/<软件id>.webp，打包时直接内联进网页（离线单文件版也有）。
// 页面取图标时走下面的 appIconUrl()：本地有就用本地，没有就回退到 JSON 里的外链。
//
// 维护：换了新图 / 新增同类软件时，重跑 `.workbuddy/icon-sync.py`（见仓库外的手册），
//       或手动把 64px 的图丢进 src/assets/icons/ 并命名成 <软件id>.webp 即可。
// 文件名（不含扩展名）必须与「软件数据/apps/<id>.json」里的 id 完全一致。
// ════════════════════════════════════════════════════════════════════
import { reactive } from 'vue';

// 打包时把 icons 目录下的图片都收进来（?url = 拿地址；单文件构建下会被内联成 data:URL）
const localIconFiles = import.meta.glob('../assets/icons/*.{png,webp,svg,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>;

/** 软件 id → 本地图标地址 */
const localIcons: Record<string, string> = {};
for (const [path, url] of Object.entries(localIconFiles)) {
  const file = path.split('/').pop() ?? '';
  const id = file.replace(/\.[^.]+$/, '');
  if (id) localIcons[id] = url;
}

/**
 * 取某个软件该用的图标地址：本地那份优先（更稳、更快），没有再用数据里写的外链。
 * 地址为空字符串时，页面会显示「名字首字」的色块兜底。
 */
export const appIconUrl = (app: { id: string; icon?: string }): string => localIcons[app.id] ?? app.icon ?? '';

/** 这些图标在本次会话里加载失败过（外链图挂掉时不再反复显示裂图，直接走首字兜底） */
const brokenIcons = reactive(new Set<string>());

/** 标记某个软件的图标加载失败（<img @error>） */
export const markIconBroken = (id: string): void => {
  brokenIcons.add(id);
};

/** 该软件当前的图标地址（失败过就返回空，交给首字兜底） */
export const appIconUrlSafe = (app: { id: string; icon?: string }): string =>
  brokenIcons.has(app.id) ? '' : appIconUrl(app);
