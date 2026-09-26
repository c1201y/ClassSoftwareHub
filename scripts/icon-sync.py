#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
图标本地化：把「外链图标」下载下来、压成 64px 的 WebP，放进 src/assets/icons/<软件id>.webp。

为什么需要它
------------
软件数据里的 `icon` 大多是各软件官网 / 图床的外链。这些外链在国内网络下有两类毛病：
  · 某些域名（GitHub 系）**根本连不上**，卡片上开天窗；
  · 某些图**体积离谱**（火绒的图标是个 484 KB 的 SVG，里面裹着一张 PNG），
    71 张卡片一起下，几百 KB 白流量 + 明显变慢。

src/gallery/appIcons.ts 的取图标逻辑是「本地那份优先，没有才回退外链」，所以只要这里
生成一张 `src/assets/icons/<id>.webp`，页面就会改用它 —— 而且**单张 ≤ 4096 字节**时
Vite 会把它内联成 data:URL（见 vite.config.ts，多文件构建用的是默认 assetsInlineLimit），
连一次网络请求都省了，离线单文件版里也在。

用法
----
    python scripts/icon-sync.py                # 只处理「该处理」的（见下），先打印计划
    python scripts/icon-sync.py --apply        # 真的下载 + 转换 + 写入
    python scripts/icon-sync.py --apply --all  # 所有还挂外链的图标全部本地化
    python scripts/icon-sync.py --apply --only 7-zip,viewpdf
    python scripts/icon-sync.py --list         # 只列出当前外链图标的体积 / 耗时 / 域名

「该处理」的判定（三条命中任一条，可用 --all 放宽到全部）
  1. 体积 ≥ 16 KB          —— 一张 64px 图标本该只有 1~3 KB
  2. 探测耗时 ≥ 1.5 s      —— 真实加载会更慢（还要建连、排队）
  3. 域名属于 GITHUB_HOSTS 或**本次探测失败** —— 用户那边同样会挂
  4. `icon` 字段是空的      —— 会退化成「首字色块」，顺手从官网 favicon 补一张

出图规矩（写死在这里，不要改）：
  · 一律 **64×64 正方形**（封面 CSS 是 object-fit: cover，非正方形会被裁）；
  · **≤ 4096 字节**（否则 Vite 不内联）；
  · 源图是「标 + 文字」横排的**文字标**时，只裁出左边那个标（_lockup_mark）——
    否则整张塞进正方形会变成方框里的一条细横线。

依赖：Pillow（`python -m pip install pillow`）。只读 软件数据/ 与网络，除 --apply 外不写任何文件。
"""

import argparse
import base64
import io
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

try:
    from PIL import Image, ImageChops
except ImportError:  # pragma: no cover
    sys.exit('缺少 Pillow，请先执行：python -m pip install pillow')

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS_DIR = os.path.join(ROOT, '软件数据', 'apps')
ICON_DIR = os.path.join(ROOT, 'src', 'assets', 'icons')

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/125.0 Safari/537.36')

# 判定阈值 —— 改这里就能调整「哪些图标算该本地化」
BIG_BYTES = 16 * 1024      # 1. 体积
SLOW_SECS = 1.5            # 2. 耗时
# 3. GitHub 系域名：国内直连经常整个连不上（appIcons.ts 的注释里点名的就是这几家）
GITHUB_HOSTS = {
    'github.com', 'www.github.com', 'raw.githubusercontent.com', 'avatars.githubusercontent.com',
    'objects.githubusercontent.com', 'camo.githubusercontent.com',
    'user-images.githubusercontent.com', 'github.githubassets.com',
    'cdn.jsdelivr.net', 'fastly.jsdelivr.net', 'gcore.jsdelivr.net', 'testingcf.jsdelivr.net',
}

TARGET_SIZE = 64           # 出图边长上限（只缩不放）
INLINE_LIMIT = 4096        # Vite 默认 assetsInlineLimit：超过它就会变成一个独立请求
TIMEOUT = 20

# 「文字标」判定 —— 源图是「标 + 文字」横排的，就只裁出左边那个标（见 _lockup_mark）
LOCKUP_ASPECT = 2.0        # 内容「宽 ÷ 高」≥ 它，才当成文字标
LOCKUP_MIN_INK = 0.02      # 裁出来的左方块至少要有 2% 的墨，否则认为裁空了、退回原图
WHITE_CUTOFF = 245         # 白底图：三通道都 > 它才算「白」（既算背景，裁边时不看）


def log(msg=''):
    print(msg, flush=True)


def http_get(url, verify=True):
    """返回 (bytes, seconds, content_type)；失败抛异常。"""
    ctx = ssl.create_default_context() if verify else ssl._create_unverified_context()
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'image/*,*/*'})
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as r:
        body = r.read()
        return body, time.perf_counter() - t0, (r.headers.get('Content-Type') or '')


def _is_cert_error(exc):
    """urllib 会把 SSLError 包在 URLError.reason 里，所以不能只 except ssl.SSLError。"""
    if isinstance(exc, ssl.SSLError):
        return True
    if isinstance(getattr(exc, 'reason', None), ssl.SSLError):
        return True
    return 'CERTIFICATE_VERIFY_FAILED' in str(exc) or 'certificate verify failed' in str(exc)


def probe(url):
    """探测一个外链图标。

    证书链坏掉的域名（希沃的 CDN 就是：校验报 Basic Constraints）降级为「不校验证书再试一次」——
    走的还是同一条链路、拿到的还是源站那张图，比让卡片一直开天窗强；结果里会标 `noverify` 好让人知道。
    """
    try:
        body, secs, ctype = http_get(url)
        return {'secs': secs, 'bytes': len(body), 'ctype': ctype, 'noverify': False}, body
    except urllib.error.HTTPError as e:
        return {'secs': 0.0, 'bytes': 0, 'error': f'HTTP {e.code}'}, None
    except Exception as e:
        if not _is_cert_error(e):
            return {'secs': 0.0, 'bytes': 0, 'error': f'{type(e).__name__}: {str(e)[:70]}'}, None
        try:
            body, secs, ctype = http_get(url, verify=False)
            return {'secs': secs, 'bytes': len(body), 'ctype': ctype, 'noverify': True}, body
        except Exception as e2:
            return {'secs': 0.0, 'bytes': 0, 'error': f'{type(e2).__name__}: {str(e2)[:70]}'}, None


def svg_embedded_raster(raw):
    """有些「SVG 图标」其实是个壳，里面裹着一张 base64 位图（火绒的就是，484 KB 里 484 KB 是 PNG）。"""
    try:
        text = raw.decode('utf-8', 'replace')
    except Exception:
        return None
    m = re.search(r'data:image/(?:png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=\s]+)', text)
    if not m:
        return None
    try:
        return base64.b64decode(re.sub(r'\s+', '', m.group(1)))
    except Exception:
        return None


def load_image(raw, ctype, url):
    """把响应体变成 PIL 图像；认出是「壳 SVG」就掏出里面的位图。"""
    is_svg = 'svg' in ctype.lower() or url.lower().endswith('.svg') or raw[:5].lower() == b'<?xml'
    if is_svg:
        inner = svg_embedded_raster(raw)
        if inner is None:
            raise ValueError('纯矢量 SVG，本脚本不会栅格化（换一张 PNG/WebP 源，或手工转好再放进来）')
        raw = inner
    return Image.open(io.BytesIO(raw))


def _ink_bbox(im):
    """「墨迹」的外框：把透明边和白底图的纯白边都刨掉。

    返回 (x0, y0, x1, y1) 或 None（整张全是白 / 全是透明时）。
    用 PIL 的 C 循环做，比逐像素扫 4096×1687 快几个数量级。
    """
    rgba = im if im.mode == 'RGBA' else im.convert('RGBA')
    red, green, blue = rgba.split()[:3]
    darkest = ImageChops.darker(ImageChops.darker(red, green), blue)
    not_white = darkest.point(lambda v: 0 if v > WHITE_CUTOFF else 255)
    alpha = rgba.getchannel('A')
    if alpha.getextrema()[0] < 255:
        # 有透明通道：透明像素直接算背景（白底 + 透明的混合图两个条件都要满足才算墨）
        opaque = alpha.point(lambda v: 255 if v > 16 else 0)
        return ImageChops.darker(opaque, not_white).getbbox()
    # 没有透明通道（白底 JPG 之类）：只能以「非白」当墨
    return not_white.getbbox()


def _lockup_mark(im):
    """源图是「标 + 文字」横排的 logo 时（火绒、WPS 那种），裁出左边那个标。

    为什么必须裁：卡片 / 详情页的图标框是**正方形 + object-fit: cover**
    （styles/home-page.css 44px、styles/download-detail-page.css 72px）。
    整张横排文字标塞进正方形，只能缩成又细又扁的一条 ——
    火绒那张在 64×64 里只有 58×16 有内容，显示出来就是「灰框中间一粒小火星」，
    跟旁边占满方框的其它图标不在一个观感上。裁出左边的标之后，标能占满方框。

    判定与退路：
      · 内容外框的「宽 ÷ 高」< LOCKUP_ASPECT（2.0）→ 不是文字标，原样返回；
      · 左边那个正方形里几乎没有墨（< LOCKUP_MIN_INK）→ 可能标在右边，退回原图。
    返回 RGBA（后续 to_webp 会按需要转回 RGB）。
    """
    rgba = im if im.mode == 'RGBA' else im.convert('RGBA')
    box = _ink_bbox(rgba)
    if box is None:
        box = rgba.getchannel('A').getbbox()
    if box is None:
        return rgba
    bw, bh = box[2] - box[0], box[3] - box[1]
    if bh <= 0 or bw < bh * LOCKUP_ASPECT:
        return rgba
    mark = rgba.crop((box[0], box[1], box[0] + bh, box[3]))
    alpha = mark.getchannel('A').point(lambda v: 255 if v > 16 else 0)
    inked = alpha.histogram()[255] / float(mark.width * mark.height)
    if inked < LOCKUP_MIN_INK:
        return rgba
    log(f'      · 横排文字标 {bw}×{bh}（宽高比 {bw / bh:.1f}）→ 裁出左边的标 {bh}×{bh}')
    return mark


def to_webp(im, budget=INLINE_LIMIT):
    """压成 WebP，保证长度 ≤ budget（这样才会被 Vite 内联，不留独立请求）。

    ⚠️ 出图**统一补成 64×64 正方形**，即使源图是宽/扁的。原因：卡片和详情页的图标 CSS 用的是
    `object-fit: cover`（见 styles/home-page.css、download-detail-page.css），
    非正方形图会被居中裁掉两侧 —— 火绒、WPS2019 那种「文字标」会被裁成半截。
    补成正方形后 cover 无事可做，整张图完整显示（多出来的部分是透明的）。
    既有的 13 张本地图标也都是 64×64，风格一致。

    进这一步之前会先过 _lockup_mark()：横排的文字标只留左边那个标，
    否则「补成正方形」的结果会变成方框里的一条细横条。
    """
    im = _lockup_mark(im)
    if im.mode in ('P', 'LA'):
        im = im.convert('RGBA')
    elif im.mode == 'CMYK':
        im = im.convert('RGB')
    # 有没有用得上透明通道，决定存 RGBA 还是 RGB
    has_alpha = im.mode in ('RGBA', 'LA') and im.getchannel('A').getextrema()[0] < 255
    im = im.convert('RGBA' if has_alpha else 'RGB')

    for side in (TARGET_SIZE, 56, 48, 40, 32):
        work = im.copy()
        work.thumbnail((side, side), Image.LANCZOS)     # 只缩不放，保持比例
        if work.size != (side, side):
            canvas = Image.new(work.mode, (side, side), (255, 255, 255) if work.mode == 'RGB' else (0, 0, 0, 0))
            canvas.paste(work, ((side - work.width) // 2, (side - work.height) // 2))
            work = canvas
        for quality in (92, 85, 78, 70, 60, 50, 40):
            buf = io.BytesIO()
            kwargs = {'quality': quality, 'method': 6}
            if work.mode == 'RGBA':
                kwargs['exact'] = True   # 保住全透明像素的原本颜色，缩放时不会出现黑边
            work.save(buf, 'WEBP', **kwargs)
            if buf.tell() <= budget:
                return buf.getvalue(), work.size
    # 实在压不下去：只剩无损/最低质量一条路，交给调用方去报告
    raise ValueError(f'压不进 {budget} 字节')


def read_apps():
    out = []
    for name in sorted(os.listdir(APPS_DIR)):
        if not name.endswith('.json') or name.startswith('_'):
            continue
        with open(os.path.join(APPS_DIR, name), encoding='utf-8') as fh:
            data = json.load(fh)
        out.append({'file': name, 'id': data.get('id') or name[:-5],
                    'name': data.get('name') or '', 'icon': (data.get('icon') or '').strip(),
                    'website': (data.get('website') or '').strip()})
    return out


def local_ids():
    if not os.path.isdir(ICON_DIR):
        return set()
    return {os.path.splitext(f)[0] for f in os.listdir(ICON_DIR)}


def icon_candidates(app):
    """该用哪些地址去取这张图标。

    `icon` 有值就用它（唯一）。`icon` 为空时**顺手救一下** —— 从官网 favicon 找一张，
    免得卡片一直显示「首字色块」：先试站点根，再试 `website` 那一层的目录
    （海康易教学助手就是只在 /teach-prepare-web/ 下挂了 favicon）。
    """
    if app['icon']:
        out = [app['icon']]
        # GitHub 的 `…/raw/<ref>/<路径>` 在国内常见「有时连得上、有时直接超时」。
        # 顺手挂一个 jsDelivr 镜像作后备（只在主链失败时才用），ViewPDF 就是这种。
        m = re.match(r'https?://github\.com/([^/]+)/([^/]+)/raw/(.+)', app['icon'])
        if m:
            out.append(f'https://cdn.jsdelivr.net/gh/{m.group(1)}/{m.group(2)}@{m.group(3)}')
        return out
    site = app['website']
    if not site:
        return []
    m = re.match(r'(https?://[^/]+)(/[^?#]*)', site)
    if not m:
        return []
    origin, path = m.group(1), m.group(2)
    dirs = []
    parts = [p for p in path.split('/')[:-1] if p]   # 去掉最后一段（多半是 xxx.html）
    while parts:
        dirs.append(origin + '/' + '/'.join(parts))
        parts.pop()
    out = [f'{origin}/favicon.ico']
    for d in dirs:
        cand = f'{d}/favicon.ico'
        if cand not in out:
            out.append(cand)
    return out


def fmt(n):
    return f'{n / 1024:.1f}K' if n >= 1024 else f'{n}B'


def main():
    ap = argparse.ArgumentParser(description='把外链图标本地化成 64px WebP')
    ap.add_argument('--apply', action='store_true', help='真的下载并写入 src/assets/icons/')
    ap.add_argument('--all', action='store_true', help='不限阈值，所有还挂外链的都处理')
    ap.add_argument('--only', default='', help='只处理这些 id（逗号分隔）；指定的 id 即使是重做也会重新生成')
    ap.add_argument('--force', action='store_true', help='已有本地图标的也重新生成一遍（仍按阈值筛选）')
    ap.add_argument('--list', action='store_true', help='只列出外链图标的体积 / 耗时 / 域名')
    args = ap.parse_args()

    if not os.path.isdir(ICON_DIR):
        os.makedirs(ICON_DIR)

    have = local_ids()
    apps = read_apps()
    only = {x.strip() for x in args.only.split(',') if x.strip()}

    todo, skip = [], []
    for app in apps:
        # 已在 --only 里点名的一律重做（方便换源图 / 改完参数重跑某几张）
        if app['id'] in have and app['id'] not in only and not args.force:
            skip.append((app['id'], '已本地化'))
            continue
        if only and app['id'] not in only:
            continue

        candidates = icon_candidates(app)
        if not candidates:
            skip.append((app['id'], '没有 icon，也找不到官网 favicon'))
            continue

        url, info, _ = '', {}, None
        last_err = ''
        for cand in candidates:
            info, body = probe(cand)
            if body is not None:
                url = cand
                break
            last_err = info.get('error', '')
        if not url:
            info = {'secs': 0.0, 'bytes': 0, 'error': last_err or '取不到'}
        host = ''
        try:
            host = urllib.parse.urlparse(url).hostname or ''
        except Exception:
            pass
        reasons = []
        if info.get('error'):
            reasons.append(f"取不到（{info['error']}）")
        else:
            if info['bytes'] >= BIG_BYTES:
                reasons.append(f"体积大（{fmt(info['bytes'])}）")
            if info['secs'] >= SLOW_SECS:
                reasons.append(f"慢（{info['secs']:.2f}s）")
            if info.get('noverify'):
                reasons.append('证书链有问题')
        if host in GITHUB_HOSTS:
            reasons.append(f'域名不稳（{host}）')
        if app['icon'] == '':
            reasons.append('原本就没有图标')

        rec = {'id': app['id'], 'name': app['name'], 'url': url, 'host': host, 'info': info,
               'reasons': reasons}
        if args.list:
            todo.append(rec)
            continue
        if reasons or args.all:
            todo.append(rec)
        else:
            skip.append((app['id'], f"没问题（{fmt(info['bytes'])} / {info['secs']:.2f}s）"))

    if args.list:
        log(f"{'id':<26}{'体积':>9}{'耗时':>8}  域名")
        log('-' * 74)
        for r in sorted(todo, key=lambda r: -(r['info'].get('bytes') or 0)):
            i = r['info']
            log(f"{r['id']:<26}{fmt(i.get('bytes') or 0):>9}{(i.get('secs') or 0):>7.2f}s  {r['host']}")
        log(f'\n共 {len(todo)} 个外链图标待处理、{len(skip)} 个已搞定/不适用')
        return

    if not todo:
        log('没有需要处理的图标（全部已本地化，或用 --all 强制全量）。')
        return

    log(f'计划处理 {len(todo)} 个图标（另有 {len(skip)} 个跳过）：')
    for r in todo:
        log(f"  · {r['id']:<26} {r['name'][:14]:<16} {'；'.join(r['reasons'])}")

    if not args.apply:
        log('\n上面只是计划。确认无误后加 --apply 真跑。')
        return

    log('')
    total_before = total_after = 0
    failed = []
    for r in todo:
        info, body = probe(r['url'])
        if body is None:
            failed.append((r['id'], info.get('error', '未知错误')))
            log(f"  ✗ {r['id']:<26} 下载失败：{info.get('error')}")
            continue
        try:
            im = load_image(body, info.get('ctype', ''), r['url'])
            webp, size = to_webp(im)
        except Exception as e:
            failed.append((r['id'], str(e)))
            log(f"  ✗ {r['id']:<26} 转换失败：{e}")
            continue
        dest = os.path.join(ICON_DIR, r['id'] + '.webp')
        with open(dest, 'wb') as fh:
            fh.write(webp)
        total_before += len(body)
        total_after += len(webp)
        extra = []
        if info.get('noverify'):
            extra.append('证书不校验')
        if len(webp) > INLINE_LIMIT:
            extra.append(f'⚠ 仍超过 {INLINE_LIMIT}B，会变成独立请求，考虑换源图')
        log(f"  ✓ {r['id']:<26} {fmt(len(body)):>8} → {fmt(len(webp)):>6}  "
            f"{size[0]}×{size[1]}{'　（' + '、'.join(extra) + '）' if extra else ''}")

    log('')
    if total_before:
        log(f'合计：{fmt(total_before)} → {fmt(total_after)}（省掉 {100 * (1 - total_after / total_before):.0f}%）')
    if failed:
        log(f'{len(failed)} 个失败：')
        for fid, why in failed:
            log(f'  · {fid}：{why}')
    log('\n下一步：npm run type-check && npm run build 看一眼产物体积。')


if __name__ == '__main__':
    main()
