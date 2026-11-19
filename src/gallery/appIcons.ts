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
const API_ICON_ORIGIN = 'https://api.classsoftwarehub.cn';
const normalizeIconUrl = (url: string): string =>
  url.startsWith(`${API_ICON_ORIGIN}/api/icon`) ? url.slice(API_ICON_ORIGIN.length) : url;
export const appIconUrl = (app: { id: string; icon?: string }): string =>
  localIcons[app.id] ?? normalizeIconUrl(app.icon ?? '');

/** 记录本次会话中加载失败的图标（外链失效时不再反复显示破损图，直接走首字兜底） */
const brokenIcons = reactive(new Set<string>());

/** 标记某个软件的图标加载失败（<img @error>） */
export const markIconBroken = (id: string): void => {
  brokenIcons.add(id);
};

/** 该软件当前的图标地址（失败过就返回空，交给首字兜底） */
export const appIconUrlSafe = (app: { id: string; icon?: string }): string =>
  brokenIcons.has(app.id) ? '' : appIconUrl(app);
