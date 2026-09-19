'use strict';
/**
 * ClassSoftwareHub 桌面版 —— 主进程
 *
 * 设计要点（与站点仓库其余部分解耦，只依赖两样东西）：
 *   1. 线上站点 https://classsoftwarehub.us.ci/  —— 内容永远跟着网站走，网页一更新，这里就是最新的
 *   2. 内置离线副本 desktop/snapshot/            —— 构建打包时从站点产物生成（单文件 HTML + version.json）
 *
 * 打开顺序（三级降级）：
 *   ① 直接加载线上站点（同时并行探一次 /version.json 取线上版本号）
 *   ② 失败 → 再试一次（这一跳会命中 Chromium 的磁盘缓存，弱网/间歇断网经常就在这一步救回来）
 *   ③ 再失败 → 加载内置离线副本，并明确告诉用户「现在看的是离线副本」
 *
 * 客户端自身**不做自动更新**：网页内容会自动跟着网站变，唯一会过期的是离线副本。
 *
 * ★ 界面里没有任何自绘的提示条 —— 窗口区域 100% 是网站本身。
 *   所有状态一律交给系统去画，这样看起来才是一个 Windows 程序而不是网页：
 *     · 副本过期 / 正在看离线副本  → 窗口标题后缀 + 任务栏图标角标（win.setOverlayIcon）
 *     · 打不开网站                → Electron 原生对话框（dialog.showMessageBox），每次启动最多弹一次
 *     · 版本明细                  → 菜单「帮助 → 版本信息…」，同样是原生对话框
 */
const { app, BrowserWindow, WebContentsView, Menu, net, shell, nativeTheme, Notification, dialog, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const SITE_ORIGIN = 'https://classsoftwarehub.us.ci';
const SITE_URL = SITE_ORIGIN + '/';
const VERSION_URL = SITE_ORIGIN + '/version.json';

const PROBE_TIMEOUT_MS = 8000;   // 探版本号（拿不到不算错，不影响打开）
const LOAD_TIMEOUT_MS = 25000;   // 加载站点首页
const SNAPSHOT_FILE = path.join(__dirname, 'snapshot', 'index.html');
const SNAPSHOT_META = path.join(__dirname, 'snapshot', 'version.json');
const APP_ID = 'cn.classsoftwarehub.desktop';
const APP_NAME = 'ClassSoftwareHub';

// ── 窗口控制按钮（最小化 / 最大化 / 关闭）──────────────────────────────
// 用系统的「窗口控制按钮覆盖层」(Window Controls Overlay)，而不是自绘按钮：
//   · 系统标题栏被去掉（titleBarStyle: 'hidden'），窗口里没有任何系统画的横条
//   · 三个按钮仍由 Windows 自己绘制，浮在网页标题栏的右端
//   · 高度必须与站点标题栏一致（src/components/WinTitleBar.vue 里 --TitleBarExpandedHeight: 48px），
//     否则站点标题栏会被撑高
//   · 宽度由系统决定（Windows 下三键共 138px），站点标题栏读 env(titlebar-area-width)
//     自动让位 —— 于是标题栏里的搜索框正好落在按钮左边，不需要改站点一个字节
const TITLEBAR_HEIGHT = 48;

// 按钮区那块背景由系统画，颜色必须和网页标题栏的底色一致，否则会是一块突兀色块。
// 站点底色 = <html> 上的 --app-bg，会随「浅色/深色/跟随系统」和节日皮肤变化，
// 所以往站点里注入一小段**无界面**的取色探针：值变了就用 console 报给主进程。
// （站点本身不受影响：不插 DOM、不改样式，只是每 500ms 读一次自己的 CSS 变量）
const OVERLAY_PROBE = `(function () {
  if (window.__cshOverlayProbe) return;
  window.__cshOverlayProbe = true;
  var last = '';
  var dark = function () {
    var cl = document.documentElement.classList;
    if (cl.contains('theme-dark')) return true;
    if (cl.contains('theme-light')) return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  };
  var tick = function () {
    var root = document.documentElement;
    var cs = getComputedStyle(root);
    var bg = (cs.getPropertyValue('--app-bg') || '').trim() || cs.backgroundColor;
    var fg = (cs.getPropertyValue('--text-primary') || '').trim() || (dark() ? '#ffffff' : '#1a1a1a');
    var key = bg + '|' + fg;
    if (key === last) return;
    last = key;
    console.log('__CSH_OVERLAY__' + key);
  };
  tick();
  setInterval(tick, 500);
})();`;

const CLIENT_VERSION = require('./package.json').version;

let win = null;
let view = null;
let offlineNotified = false;   // 断网提示每次启动只弹一次（用户点过「继续浏览」就别再烦他）

const state = {
  clientVersion: CLIENT_VERSION,
  mode: 'boot',            // boot | online | snapshot | snapshot-missing
  snapshot: null,          // 内置离线副本的版本信息（打包时写入）
  online: null,            // 线上版本信息（探测成功时）
  onlineError: null,       // 线上探测/加载失败原因
  lastCheckAt: null,
  attempts: 0
};

/* ────────────────────────── 版本信息 ────────────────────────── */

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readSnapshotInfo() {
  const meta = readJson(SNAPSHOT_META);
  if (!meta) return null;
  return {
    version: String(meta.version ?? '') || null,
    build: String(meta.build ?? '') || null,
    builtAt: String(meta.builtAt ?? '') || null
  };
}

/** 探线上 /version.json；失败只记原因，不抛错 */
async function probeOnline() {
  try {
    const res = await net.fetch(VERSION_URL + '?_=' + Date.now(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const meta = await res.json();
    return {
      ok: true,
      info: {
        version: String(meta.version ?? '') || null,
        build: String(meta.build ?? '') || null,
        builtAt: String(meta.builtAt ?? '') || null
      }
    };
  } catch (e) {
    return { ok: false, error: e && e.name === 'TimeoutError' ? '探测超时' : String((e && e.message) || e) };
  }
}

/** 内置副本是否落后于线上（比 build 号，比不到再比版本串） */
function isStale() {
  const a = state.snapshot;
  const b = state.online;
  if (!a || !b) return false;
  if (a.build && b.build) return a.build !== b.build;
  if (a.version && b.version) return a.version !== b.version;
  return false;
}

/** 「v2.3.2（2026-09-19）」这样的一行字，用于标题和对话框 */
function stamp(info) {
  if (!info) return '未知';
  const v = info.version
    ? (String(info.version).startsWith('v') ? String(info.version) : 'v' + info.version)
    : null;
  const day = info.builtAt ? (String(info.builtAt).match(/\d{4}-\d{2}-\d{2}/) || [])[0] : null;
  if (v && day) return `${v}（${day}）`;
  return v || info.build || '未知';
}

function localTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function modeLabel(mode) {
  return mode === 'online' ? '网站最新内容'
    : mode === 'snapshot' ? '内置离线副本'
      : mode === 'snapshot-missing' ? '离线副本缺失'
        : '正在检查…';
}

/* ────────────────────────── 状态呈现（全部交给系统）────────────────────────── */

const badgeCache = {};

function badgeImage(kind) {
  if (!(kind in badgeCache)) {
    const file = path.join(__dirname, 'assets', 'badge-' + kind + '.png');
    badgeCache[kind] = fs.existsSync(file) ? nativeImage.createFromPath(file) : null;
  }
  return badgeCache[kind];
}

/**
 * 把当前状态反映到 Windows 自己绘制的地方：窗口标题 + 任务栏图标角标。
 * 不用任何自绘控件 —— 标题栏和任务栏都是系统画的，天然原生。
 */
function applyWindowChrome() {
  if (!win || win.isDestroyed()) return;

  let suffix = '';
  let badge = null;
  let tip = '';

  if (state.mode === 'snapshot') {
    suffix = ' - 离线副本 ' + stamp(state.snapshot);
    badge = 'warn';
    tip = '正在显示内置离线副本';
  } else if (state.mode === 'snapshot-missing') {
    suffix = ' - 无法访问网站';
    badge = 'error';
    tip = '无法访问网站，且没有离线副本';
  } else if (state.mode === 'online' && isStale()) {
    suffix = ' - 网站有更新';
    badge = 'info';
    tip = '随应用附带的离线副本已过期';
  }

  win.setTitle(APP_NAME + suffix);
  win.setOverlayIcon(badge ? badgeImage(badge) : null, tip);
}

/* ────────────────── 窗口控制按钮覆盖层（取色跟随网页）────────────────── */

/** 把 rgb()/rgba()/#abc 一律规整成 #rrggbb —— 系统覆盖层取色用十六进制最稳 */
function toHexColor(value) {
  const v = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return '#' + v.slice(1).split('').map((c) => c + c).join('');
  }
  const m = v.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].split(/[,\s/]+/).map((s) => parseFloat(s)).filter((n) => Number.isFinite(n));
  if (parts.length < 3) return null;
  const hex = parts.slice(0, 3)
    .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
    .join('');
  return '#' + hex;
}

/** 未取到网页底色时的兜底：跟随系统深浅色，与站点默认底色一致 */
function fallbackOverlayColors() {
  return nativeTheme.shouldUseDarkColors
    ? { color: '#202020', symbolColor: '#ffffff' }
    : { color: '#F3F3F3', symbolColor: '#1a1a1a' };
}

let overlayColors = null;

function applyTitleBarOverlay(bg, fg) {
  if (!win || win.isDestroyed()) return;
  if (!win.setTitleBarOverlay) return;   // 非 Windows / 旧版 Electron
  const next = {
    color: toHexColor(bg) || fallbackOverlayColors().color,
    symbolColor: toHexColor(fg) || fallbackOverlayColors().symbolColor,
    height: TITLEBAR_HEIGHT
  };
  if (overlayColors && overlayColors.color === next.color && overlayColors.symbolColor === next.symbolColor) {
    return;   // 没变就别反复调系统接口
  }
  overlayColors = next;
  try {
    win.setTitleBarOverlay(next);
  } catch { /* 系统不支持就保持上一次的颜色 */ }
}

/** 断网时用**原生对话框**说明一次（Windows 应用的做法），不往窗口里塞任何东西 */
async function notifyOfflineOnce() {
  if (offlineNotified) return;
  if (state.mode !== 'snapshot' && state.mode !== 'snapshot-missing') return;
  if (!win || win.isDestroyed()) return;
  offlineNotified = true;

  const missing = state.mode === 'snapshot-missing';
  const res = await dialog.showMessageBox(win, {
    type: 'warning',
    title: APP_NAME,
    message: missing ? '打不开网站，也没有离线副本' : '打不开网站，已切换到离线副本',
    detail: missing
      ? '当前网络访问不到站点，这个桌面版里也没有随包附带的离线副本。\n请检查网络连接后重试。'
      : '当前网络访问不到站点，已切换到随应用附带的离线副本 · ' + stamp(state.snapshot) + '。\n' +
        '离线副本是打包时的快照，内容可能不是最新的；联网后从「帮助 → 重新检查更新」即可回到网站最新内容。',
    buttons: ['重试', '继续浏览'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });

  if (res.response === 0) bootSite();
}

/** 版本明细：菜单「帮助 → 版本信息…」，用原生对话框显示 */
function showVersionInfo() {
  if (!win || win.isDestroyed()) return;

  const lines = [
    '桌面版：v' + state.clientVersion,
    '当前显示：' + modeLabel(state.mode),
    '内置离线副本：' + stamp(state.snapshot),
    '网站当前版本：' + (state.online ? stamp(state.online) : '未能获取'),
    '上次检查：' + localTime(state.lastCheckAt)
  ];

  if (state.mode === 'online' && isStale()) {
    lines.push('', '随应用附带的离线副本已落后于网站 —— 断网时会看到旧内容。');
  }
  if (state.onlineError) {
    lines.push('', '最近一次访问网站失败：' + state.onlineError + '（已尝试 ' + state.attempts + ' 次）');
  }

  dialog.showMessageBox(win, {
    type: 'info',
    title: '版本信息',
    message: APP_NAME + ' 桌面版',
    detail: lines.join('\n'),
    buttons: ['确定'],
    noLink: true
  });
}

/** GPU 功能状态 → 人话 */
function gpuLabel(value) {
  const map = {
    enabled: '启用',
    disabled_software: '未启用 · 软件模拟',
    unavailable_software: '不可用 · 软件模拟',
    disabled_off: '未启用',
    unavailable_off: '不可用'
  };
  return map[value] || value || '未知';
}

/**
 * 诊断信息：界面「卡不卡」多半就取决于显卡到底有没有被用上，
 * 这里把实情摆到明面上，免得只能靠猜。
 */
async function showDiagnostics() {
  if (!win || win.isDestroyed()) return;

  let fps = null;
  try {
    if (view && !view.webContents.isDestroyed()) {
      fps = await view.webContents.executeJavaScript(`new Promise(function (resolve) {
        if (document.hidden) { resolve(-1); return; }
        var n = 0, t0 = performance.now();
        var tick = function () {
          n++;
          if (performance.now() - t0 < 1100) requestAnimationFrame(tick);
          else resolve(n);
        };
        requestAnimationFrame(tick);
        setTimeout(function () { resolve(n); }, 2500);
      })`);
    }
  } catch { /* 拿不到就算未测出 */ }

  const gpu = (app.getGPUFeatureStatus && app.getGPUFeatureStatus()) || {};
  const accel = app.isHardwareAccelerationEnabled ? app.isHardwareAccelerationEnabled() : null;

  const lines = [
    '桌面版：v' + state.clientVersion,
    'Electron ' + process.versions.electron + ' · Chromium ' + process.versions.chrome,
    '系统：' + process.platform + ' ' + process.arch,
    '',
    '硬件加速：' + (accel === null ? '未知' : accel ? '已启用' : '已关闭'),
    'GPU 光栅化：' + gpuLabel(gpu.rasterization),
    'GPU 合成：' + gpuLabel(gpu.gpu_compositing),
    'WebGL：' + gpuLabel(gpu.webgl),
    '2D 画布加速：' + gpuLabel(gpu['2d_canvas']),
    '',
    '实测帧率：' + (fps === -1 ? '窗口不在前台，未测' : fps == null ? '未测出' : fps + ' fps'),
    '',
    '怎么读这份信息：',
    '· 帧率稳定在 55~60 = 流畅；明显更低就是界面在吃力。',
    '· 「硬件加速」显示已关闭，或上面几项显示「软件模拟」= 这台机器的显卡没被采用，',
    '  界面会发黏 —— 这是本机显卡驱动/黑名单问题，不是软件本身的问题。',
    '· 想排除站点材质的影响：打开网站「设置 → 材质」，把 Mica 换成别的再对比一次。',
    '',
    '把这几行原样发给维护者即可。'
  ];

  dialog.showMessageBox(win, {
    type: 'info',
    title: '诊断信息',
    message: '桌面版渲染诊断',
    detail: lines.join('\n'),
    buttons: ['确定'],
    noLink: true
  });
}

/* ────────────────────────── 布局 ────────────────────────── */

/** 站点视图始终铺满整个内容区 —— 窗口里除了网站没有别的东西 */
function layout() {
  if (!win || win.isDestroyed() || !view) return;
  const [width, height] = win.getContentSize();
  view.setBounds({ x: 0, y: 0, width, height });
}

/* ────────────────────────── 站点视图 ────────────────────────── */

/** 带超时地加载一个 URL（靠 webContents 事件判定成败） */
function loadWithTimeout(wc, url, timeout) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      wc.off('did-finish-load', onOk);
      wc.off('did-fail-load', onFail);
      fn(arg);
    };
    const onOk = () => finish(resolve);
    const onFail = (_e, code, desc, _url, isMainFrame) => {
      if (!isMainFrame || code === -3) return; // -3 = ERR_ABORTED（我们自己打断的，不算失败）
      finish(reject, new Error(desc + ' (' + code + ')'));
    };
    const timer = setTimeout(() => finish(reject, new Error('加载超时')), timeout);
    wc.once('did-finish-load', onOk);
    wc.on('did-fail-load', onFail);
    // 真正的失败由 did-fail-load 接管，这里吞掉 promise 拒绝，免得变成 unhandled rejection
    wc.loadURL(url).catch(() => {});
  });
}

function isInternal(url) {
  if (url.startsWith(SITE_ORIGIN)) return true;
  if (url.startsWith('file://')) return true; // 离线副本里的站内跳转
  return false;
}

function openOutside(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

/** 三级降级：线上 → 重试（吃缓存）→ 内置离线副本 */
async function bootSite() {
  state.attempts += 1;
  state.lastCheckAt = new Date().toISOString();
  state.mode = 'boot';
  state.onlineError = null;
  applyWindowChrome();

  const probePromise = probeOnline();          // 与首屏加载并行

  let loaded = false;
  try {
    await loadWithTimeout(view.webContents, SITE_URL, LOAD_TIMEOUT_MS);
    loaded = true;
  } catch (e) {
    state.onlineError = String((e && e.message) || e);
  }

  if (!loaded) {
    // 第二轮：很多时候只是瞬时抖动，这一跳会命中磁盘缓存
    try {
      await loadWithTimeout(view.webContents, SITE_URL, LOAD_TIMEOUT_MS);
      loaded = true;
      state.onlineError = null;
    } catch (e) {
      state.onlineError = String((e && e.message) || e);
    }
  }

  const probe = await probePromise;
  if (probe.ok) state.online = probe.info;
  else if (!state.onlineError) state.onlineError = probe.error;

  if (loaded) {
    state.mode = 'online';
  } else if (fs.existsSync(SNAPSHOT_FILE)) {
    state.mode = 'snapshot';
    try {
      await view.webContents.loadFile(SNAPSHOT_FILE);
    } catch (e) {
      state.onlineError = String((e && e.message) || e);
      state.mode = 'snapshot-missing';
    }
  } else {
    state.mode = 'snapshot-missing';
    try {
      await view.webContents.loadFile(path.join(__dirname, 'shell', 'no-copy.html'));
    } catch { /* 兜底页都没有就只能空着了 */ }
  }

  applyWindowChrome();
  void notifyOfflineOnce();
}

function createSiteView() {
  view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: 'persist:csh-desktop'   // 持久化：缓存 / Cookie 落盘，离线时能吃到
    }
  });
  view.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#202020' : '#ffffff');
  // 让站长在统计里能把桌面版和浏览器区分开
  view.webContents.setUserAgent(
    view.webContents.getUserAgent().replace(/\sElectron\/[\d.]+/, '') +
    ' ClassSoftwareHubDesktop/' + CLIENT_VERSION
  );

  // 让窗口控制按钮那块背景跟着网页底色走（深浅色 / 节日皮肤都会变）
  view.webContents.on('dom-ready', () => {
    view.webContents.executeJavaScript(OVERLAY_PROBE).catch(() => {});
  });
  view.webContents.on('console-message', (event) => {
    const text = String((event && event.message) || '');
    const at = text.indexOf('__CSH_OVERLAY__');
    if (at < 0) return;
    const [bg, fg] = text.slice(at + '__CSH_OVERLAY__'.length).split('|');
    applyTitleBarOverlay(bg, fg);
  });

  // 站内链接留在窗口里，站外一律交给系统浏览器（下载包也走浏览器，用户更习惯）
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) {
      view.webContents.loadURL(url).catch(() => {});
    } else {
      openOutside(url);
    }
    return { action: 'deny' };
  });
  view.webContents.on('will-navigate', (event, url) => {
    if (isInternal(url)) return;
    event.preventDefault();
    openOutside(url);
  });

  // 站内直链（自己托管的文件）走 Electron 下载，完成后用系统通知提示一声；GitHub 等外链已交给浏览器
  view.webContents.session.on('will-download', (_event, item) => {
    const name = item.getFilename();
    item.once('done', (_e, status) => {
      if (status === 'completed' && Notification.isSupported()) {
        new Notification({ title: '下载完成', body: name }).show();
      }
    });
  });

  // 渲染进程崩了就重来一次，别留白屏
  view.webContents.on('render-process-gone', () => {
    setTimeout(() => bootSite(), 800);
  });

  win.contentView.addChildView(view);
  layout();
}

/* ────────────────────────── 窗口 ────────────────────────── */

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#202020' : '#F3F3F3',
    autoHideMenuBar: true,
    show: false,
    // 去掉系统标题栏；三个窗口按钮仍由系统绘制，浮在网页标题栏右端。
    // 颜色稍后由网页的实际底色接管（见 applyTitleBarOverlay / OVERLAY_PROBE）。
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...fallbackOverlayColors(), height: TITLEBAR_HEIGHT }
  });
  overlayColors = { ...fallbackOverlayColors(), height: TITLEBAR_HEIGHT };

  // 标题由主进程说了算（承载页的 <title> 不许覆盖它），否则状态后缀会被冲掉
  win.webContents.on('page-title-updated', (event) => event.preventDefault());

  win.once('ready-to-show', () => {
    win.show();
    applyWindowChrome();
    // 网页还没报底色之前，先用跟随系统深浅色的兜底色，避免按钮区突兀
    applyTitleBarOverlay();
  });
  // 承载页每次加载完成都把标题/角标重设一遍：electron 的 page-title-updated 未必拦得住
  // 页面自己改标题，这里兜一道底，保证浏览器画的那行字永远由我们说了算。
  win.webContents.on('did-finish-load', () => applyWindowChrome());
  win.on('resize', layout);
  win.on('closed', () => { win = null; view = null; });

  win.loadFile(path.join(__dirname, 'shell', 'index.html'));
  createSiteView();

  // 只留键盘快捷键，不显示菜单栏（Alt 可临时唤出）
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'fileMenu', label: '文件' },
    { role: 'viewMenu', label: '视图' },
    { role: 'windowMenu', label: '窗口' },
    {
      label: '帮助',
      submenu: [
        { label: '打开网站首页', click: () => view && view.webContents.loadURL(SITE_URL).catch(() => {}) },
        { label: '重新检查更新', click: () => bootSite() },
        { type: 'separator' },
        { label: '版本信息…', click: () => showVersionInfo() },
        { label: '诊断信息…', click: () => void showDiagnostics() },
        { type: 'separator' },
        { label: '打开项目主页', click: () => openOutside('https://github.com/c1201y/ClassSoftwareHub') }
      ]
    }
  ]));

  state.snapshot = readSnapshotInfo();
  bootSite();
}

/* ────────────────────────── 生命周期 ────────────────────────── */

app.setAppUserModelId(APP_ID);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    nativeTheme.on('updated', () => {
      const dark = nativeTheme.shouldUseDarkColors;
      if (win && !win.isDestroyed()) win.setBackgroundColor(dark ? '#202020' : '#F3F3F3');
      if (view) view.setBackgroundColor(dark ? '#202020' : '#ffffff');
    });
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
