#!/usr/bin/env python3
"""Mirror the built site (``dist/``) into an OpenList / WebDAV collection.

Why this script exists
----------------------
The site used to ship as a **single-file** HTML, so the upload step only had to
push one ``index.html``.  The site is now built as a normal **multi-file** bundle
(``index.html`` + ``assets/``), so the upload has to:

1. create the sub-directories that the build produced (``assets/``),
2. upload **every file exactly as it is** — no zip / tar / gzip, the remote
   folder is a browsable copy of ``dist/``,
3. remove the **orphans** left over from previous deploys, but *only inside the
   folders this build produced* (in practice just ``assets/``).  Vite names every
   asset with a content hash, so each deploy adds new file names and the old ones
   would otherwise pile up forever.  The target root is never pruned — it may
   hold files we do not own, and our own top-level files have stable names that
   are simply overwritten.
   Note that a collection which vanished from ``dist/`` entirely is removed as a
   leftover child of its parent (WebDAV ``DELETE`` on a collection is recursive),
   so an old ``assets/old-subdir/`` does not survive.  Only a top-level folder
   that is missing from the build is left alone, by the rule above.

Every HTTP request is retried with a connect timeout: this OpenList host is a
small domestic box that occasionally drops connections (see repo history).

Environment
-----------
``WEBDAV_BASE``        target collection URL, may contain ``%XX`` escapes
``WEBDAV_USERNAME``    / ``WEBDAV_PASSWORD``  HTTP Basic credentials
``LOCAL_DIR``          folder to upload, default ``dist``
``PRUNE``              ``0`` = keep orphans, default ``1`` = delete them
``WEBDAV_NO_VERIFY``   ``1`` = skip TLS verification.  **Local debugging only**
                       (this sandbox sits behind a TLS-intercepting proxy).
                       CI never sets it.

Exit code 0 means: every file of the build is live, and the folder matches.
"""

from __future__ import annotations

import base64
import os
import posixpath
import socket
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

DAV = '{DAV:}'

PROPFIND_BODY = (
    b'<?xml version="1.0" encoding="utf-8"?>'
    b'<propfind xmlns="DAV:"><prop>'
    b'<resourcetype/><getcontentlength/>'
    b'</prop></propfind>'
)


def env(name: str, default: str | None = None, required: bool = False) -> str:
    value = os.environ.get(name, default)
    if required and not value:
        sys.exit(f'::error::环境变量 {name} 未设置')
    return value or ''


BASE = env('WEBDAV_BASE', required=True).rstrip('/')
LOCAL_DIR = env('LOCAL_DIR', 'dist')
PRUNE = env('PRUNE', '1') != '0'
ATTEMPTS = int(env('WEBDAV_ATTEMPTS', '3'))
TIMEOUT = float(env('WEBDAV_TIMEOUT', '180'))

AUTH = base64.b64encode(
    f'{env("WEBDAV_USERNAME", required=True)}:{env("WEBDAV_PASSWORD", required=True)}'.encode()
).decode()
UA = 'ClassSoftwareHub-Deploy/1.0'


def _ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    if os.environ.get('WEBDAV_NO_VERIFY') == '1':
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    return ctx


CTX = _ssl_context()
BASE_PATH = urllib.parse.unquote(urllib.parse.urlsplit(BASE).path).rstrip('/')


class DavError(RuntimeError):
    """一个 DAV 请求在重试若干次后仍失败。

    `status` 带上最后一次的 HTTP 状态码（网络层异常时为 None）—— 调用方需要按码分流时
    （见 mkcol：301/302 是重定向，不能当「目录已存在」）不必去解析错误字符串。
    """

    def __init__(self, method: str, url: str, last: str, status: int | None = None) -> None:
        super().__init__(f'{method} {url} → {last}')
        self.method = method
        self.url = url
        self.status = status


def dav(method: str, url: str, data: bytes | None = None,
        headers: dict[str, str] | None = None,
        ok: tuple[int, ...] = (200, 201, 204, 207)) -> bytes:
    """One WebDAV request, retried with a linear back-off."""
    last = 'unknown'
    last_status: int | None = None
    for attempt in range(1, ATTEMPTS + 1):
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header('Authorization', 'Basic ' + AUTH)
        req.add_header('User-Agent', UA)
        for key, value in (headers or {}).items():
            req.add_header(key, value)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT, context=CTX) as resp:
                body = resp.read()
                if resp.status not in ok:
                    last = f'HTTP {resp.status} {resp.reason}'
                    last_status = resp.status
                else:
                    return body
        except urllib.error.HTTPError as exc:
            if exc.code in ok:          # e.g. 405 when MKCOL finds an existing folder
                return b''
            last = f'HTTP {exc.code} {exc.reason}'
            last_status = exc.code
        except Exception as exc:        # noqa: BLE001 — network layer, retry anything
            last = f'{type(exc).__name__}: {exc}'
            last_status = None
        if attempt < ATTEMPTS:
            delay = attempt * 10
            print(f'      ... {method} 第 {attempt} 次失败（{last}），{delay}s 后重试', flush=True)
            time.sleep(delay)
    raise DavError(method, url, last, last_status)


def mkcol(rel_dir: str) -> None:
    """建一个集合（目录）；已经存在算成功。

    成功码只有 2xx 与 405（RFC 4918：对已存在的集合执行 MKCOL 回 405）。

    ⚠️ 以前这里还把 **301 当成功**，注释写的理由是「和 405 一样表示目录在」—— 并不成立：
    301/302 是**重定向**（WebDAV 服务器常要求集合 URL 以 `/` 结尾，于是重定向到带斜杠的地址），
    它既不保证目录存在、也不保证 MKCOL 生效。而 urllib 收到重定向后是拿 **GET** 去跟的，
    于是目录根本没建出来，紧接着的 PUT 报 409，报错完全指不到这里（2026-09-25 审计发现）。
    现在改成：遇到重定向就带尾斜杠再试一次（这才是服务器想要的写法），仍失败就抛出去 ——
    宁可这一次部署红掉、也不要静默留下一个半成品镜像。
    """
    url = url_for(rel_dir)
    try:
        dav('MKCOL', url, ok=(200, 201, 204, 405))
    except DavError as exc:
        if exc.status not in (301, 302, 307, 308):
            raise
        print(f'      MKCOL {rel_dir} 被重定向（HTTP {exc.status}），按「集合 URL 要带尾斜杠」重试', flush=True)
        dav('MKCOL', url + '/', ok=(200, 201, 204, 405))


# --------------------------------------------------------------------------- #
# local side
# --------------------------------------------------------------------------- #

def walk_local(root: str) -> tuple[list[str], set[str]]:
    """Return (relative file paths as posix, all directories incl. parents)."""
    files: list[str] = []
    dirs: set[str] = set()
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root).replace(os.sep, '/')
        if rel_dir != '.':
            parts = rel_dir.split('/')
            for i in range(1, len(parts) + 1):
                dirs.add('/'.join(parts[:i]))
        for name in filenames:
            rel = name if rel_dir == '.' else f'{rel_dir}/{name}'
            files.append(rel)
            parent = posixpath.dirname(rel)
            while parent:
                dirs.add(parent)
                parent = posixpath.dirname(parent)
    return sorted(files), dirs


def url_for(rel: str) -> str:
    return BASE + '/' + urllib.parse.quote(rel, safe='/')


# --------------------------------------------------------------------------- #
# remote side
# --------------------------------------------------------------------------- #

def rel_of(href: str) -> str | None:
    """Map a PROPFIND href to a path relative to BASE, or None if outside it."""
    path = urllib.parse.urlsplit(href).path if '://' in href else href
    path = urllib.parse.unquote(path)
    stripped = path.rstrip('/')
    if stripped == BASE_PATH:
        return ''
    if not stripped.startswith(BASE_PATH + '/'):
        return None
    return stripped[len(BASE_PATH) + 1:]


def list_dir(rel: str) -> list[str]:
    """Relative paths directly inside BASE/rel (files and folders).

    A PROPFIND reply always contains the collection itself — drop that one.
    """
    body = dav('PROPFIND', url_for(rel) if rel else BASE + '/',
               data=PROPFIND_BODY,
               headers={'Depth': '1', 'Content-Type': 'application/xml; charset=utf-8'})
    out = []
    for response in ET.fromstring(body).iter(DAV + 'response'):
        child = rel_of(response.findtext(DAV + 'href') or '')
        if child and child != rel:      # '' and `rel` are the collection itself
            out.append(child)
    return out


# --------------------------------------------------------------------------- #

def main() -> int:
    socket.setdefaulttimeout(30)

    files, dirs = walk_local(LOCAL_DIR)
    if not files:
        sys.exit(f'::error::{LOCAL_DIR}/ 是空的，没有可上传的文件')
    total = sum(os.path.getsize(os.path.join(LOCAL_DIR, f)) for f in files)
    print(f'本地 {LOCAL_DIR}/：{len(files)} 个文件 · {len(dirs)} 个子目录 · {total / 1024:.1f} KiB')
    print('全部按原样上传（不压缩、不打包）\n')

    # 1) directories ---------------------------------------------------------- #
    for rel_dir in sorted(dirs):
        mkcol(rel_dir)
    print(f'[1/3] 目录就绪：{len(dirs)} 个')

    # 2) files ---------------------------------------------------------------- #
    for index, rel in enumerate(files, 1):
        with open(os.path.join(LOCAL_DIR, rel), 'rb') as handle:
            payload = handle.read()
        dav('PUT', url_for(rel), data=payload,
            headers={'Content-Type': 'application/octet-stream',
                     'Content-Length': str(len(payload))})
        print(f'[2/3] ({index}/{len(files)}) {rel}  {len(payload) / 1024:.1f} KiB')

    # 3) verify then prune ---------------------------------------------------- #
    seen: set[str] = set()
    for rel_dir in [''] + sorted(dirs):
        seen.update(list_dir(rel_dir))
    missing = [f for f in files if f not in seen]
    if missing:
        print(f'::error::上传后仍有 {len(missing)} 个文件在服务器上看不到：{missing[:5]}')
        return 1
    print(f'[3/3] 校验通过：{len(files)} 个文件全部在线')

    if not PRUNE:
        print('PRUNE=0，保留服务器上多出来的文件，跳过清理')
        return 0

    # Only the folders this build produced are mirrored exactly (in practice just
    # `assets/`, where the content-hashed names churn on every deploy).  The
    # target root is never pruned: it may hold files we do not own, and our own
    # top-level files (index.html, robots.txt, …) have stable names that are
    # simply overwritten.
    removed = 0
    for rel_dir in sorted(dirs):
        keep_here = {f for f in files if posixpath.dirname(f) == rel_dir}
        keep_here |= {d for d in dirs if posixpath.dirname(d) == rel_dir}
        for rel in sorted(set(list_dir(rel_dir)) - keep_here):
            dav('DELETE', url_for(rel), ok=(200, 204))
            print(f'      清理残留 {rel}')
            removed += 1
    print(f'[3/3] 已清理 {removed} 个上个版本遗留的文件（`assets/` 之外的目录不参与清理）')

    extras = sorted(set(list_dir('')) - set(files) - dirs)
    if extras:
        print(f'      注意：根目录上还有 {len(extras)} 项不属于本次构建、已保留：{extras[:5]}')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except RuntimeError as error:
        print(f'::error::{error}')
        sys.exit(1)
