// ════════════════════════════════════════════════════════════════════
// 软件图标的本地兜底表
//
// 背景：软件数据里的 icon 大多指向外部图片地址（各软件官网 / 图床），
// 其中托管在 GitHub（avatars / raw / github.com/.../raw/...）与 jsDelivr
// 上的部分在国内网络下经常加载失败，导致卡片图标缺失。
//
// 处理方式：将国内访问不稳、体积过大的图标预先下载并压缩为 64px 小图，
// 存放于 src/assets/icons/<软件id>.webp，打包时内联进网页（离线单文件版同样生效）。
// 页面取图标时经 appIconUrl()：本地存在则用本地，否则回退到 JSON 中的外链。
//
// 维护：执行 `python scripts/icon-sync.py --apply`（脚本会自动探测每张外链图标的
//       体积与耗时，按阈值筛选出需本地化的；`--all` 全量处理，`--only id,id` 只重做
//       指定的几张）。也可手工将 64px 的图放入 src/assets/icons/ 并命名为 <软件id>.webp。
// 硬性要求：
//   ① 文件名（不含扩展名）必须与「软件数据/apps/<id>.json」里的 id 完全一致；
//   ② 出图必须是 64×64 正方形、且 ≤ 4096 字节：
//      非正方形会被卡片/详情页的 `object-fit: cover` 裁掉两侧；
//      超过 4096 字节将无法被 Vite 内联（assetsInlineLimit），额外多一次请求。
//   ③ 横排的「标 + 文字」组合 logo（如火绒）不得整张放入正方形：磁贴仅 44 / 72 px，
//      3.5:1 的整张图缩放后只剩中间一条细横线。icon-sync.py 的 _lockup_mark() 会
//      自动裁出左侧标识；手工处理时也应先裁剪再保存为 <id>.webp。
// ════════════════════════════════════════════════════════════════════
import { reactive } from 'vue';

// 打包时收集 icons 目录下的全部图片（?url 获取地址；单文件构建下会被内联成 data:URL）
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
 * 返回软件应使用的图标地址：本地图标优先（更稳定、更快），无本地图标时回退数据中的外链。
 * 返回空字符串时，页面显示「名字首字」的色块兜底。
 */
export const appIconUrl = (app: { id: string; icon?: string }): string => localIcons[app.id] ?? app.icon ?? '';

/** 记录本次会话中加载失败的图标（外链失效时不再反复显示破损图，直接走首字兜底） */
const brokenIcons = reactive(new Set<string>());

/** 标记某个软件的图标加载失败（<img @error>） */
export const markIconBroken = (id: string): void => {
  brokenIcons.add(id);
};

/** 该软件当前的图标地址（失败过就返回空，交给首字兜底） */
export const appIconUrlSafe = (app: { id: string; icon?: string }): string =>
  brokenIcons.has(app.id) ? '' : appIconUrl(app);
