# AGENTS.md — ClassSoftwareHub Project Guide

> Source repository of the *ClassSoftwareHub* download site for classroom-PC administrators
> (电教委员). A Vue 3 + Vite + TypeScript single-page app whose UI is built on the open-source
> **WinUIonWeb** component library. The site serves **classroom computers / AV-equipment admins**
> and curates with a clear bias: **no ads, no bundled junk, open source first**.
>
> This file is the minimum context an AI agent (or a new contributor) needs. **Read it before
> making any change** — especially "Hard Rules" and "Directory Map". `README.md` is the repo's public
> description (what it is, how to run and maintain it); this file is the code-level guide.

---

## 0. At a Glance

| | |
|---|---|
| Stack | Vue 3.5 + Vue Router 4 (**hash routing**) + Vite 8 + TypeScript. Pure static front end, no backend |
| Boot path | `index.html` → `src/main.ts` → `src/gallery/App.vue` (shell) → `src/gallery/router.ts` (8 routes: home / detail / settings / submit / feedback / tools / single tool / AI nav) |
| App code | Everything lives in `src/gallery/` — **the only place you should change code** |
| Data | `软件数据/apps/*.json` (one file per app; 71 today, plus `_模板.json`) + `软件数据/categories.json` (4 categories) |
| Strings | Chinese = `文字设置.ts` at repo root; English = `src/gallery/Strings/en-US/Resources.ts` |
| Live site | https://classsoftwarehub.us.ci (main) — mirrors: classsoftwarehub.132614.xyz (see `CNAME`) · classsoftwarehub.xfane.com |
| Output | `npm run build` → `dist/` (multi-file, **what CI ships**); `SINGLEFILE=1` → one HTML file (offline / double-click) |

### Commands

```bash
npm install           # first time only
npm run dev           # dev server at http://localhost:5173
npm run type-check    # vue-tsc --build (run it after touching any .ts/.vue)
npm run build         # multi-file bundle → dist/ — this is what CI deploys
npm run build:single  # single-file bundle → dist/index.html (~2 MB, opens offline)
npm run check         # type-check + build
```

---

## 1. Directory Map

```
文字设置.ts                    ★ All Chinese UI strings (the only file to touch for copy)
鸣谢文本.ts                       Credits list on the Settings page (independent of 文字设置.ts)
AI导航文本.ts                    Site list + copy for the AI-nav page (independent of 文字设置.ts)
软件数据/
  ├─ categories.json             The 4 categories: system / schedule / teaching / other
  ├─ update-ignore.json          Apps the update checker should stop nagging about (see "CI Notes")
  ├─ README-维护手册.md          ★ Read this before editing data
  └─ apps/<id>.json              One file per app; files starting with `_` are not loaded
public/                        Copied verbatim into dist/ — robots.txt · sitemap.xml · favicon.ico · og-cover.png · BingSiteAuth.xml (see "SEO & the share card")
src/
  ├─ main.ts                     Mount entry
  ├─ gallery/                  ★ This site's application code
  │   ├─ App.vue                 Shell: nav pane / theme / holiday skin / welcome dialog / data-error bar
  │   ├─ router.ts               The 8 routes (table below)
  │   ├─ pages/                  HomePage / DownloadDetailPage / SettingsPage / SubmitPage / AiNavPage / FeedbackPage
  │   ├─ tools/                  ★ Built-in tools: index.ts registry + ToolShell.vue + one .vue per tool
  │   │                           (adding a tool = one registry entry; its route is generated from it)
  │   ├─ aiSiteIcons.ts          Site icons for the AI-nav page (inlined base64, no third-party icon service)
  │   ├─ appIcons.ts             ★ App-icon resolver: prefers the local 64 px copy, falls back to the `icon` URL
  │   ├─ data/index.ts           Data loader: types + fault-tolerant parsing (⚠️ do not edit)
  │   ├─ githubImport.ts         "Import from GitHub" (从 GitHub 一键读取) on the submit page
  │   ├─ feedback.ts             Feedback-centre logic: the kind / sub-kind tables, the six GitHub labels,
  │   │                           issue title+body assembly, validation, draft and clipboard helpers
  │   ├─ searchIndex.ts          ★ Search index behind the global search panel (apps / tools / AI sites / pages)
  │   ├─ GlobalSearch.vue        The Ctrl+K search panel: grouped results, ↑↓ / Enter / Esc
  │   ├─ visitor.ts              Self-hosted visit counter + Baidu Analytics SPA pageview replay
  │   ├─ holidayTheme.ts         Holiday skin (Mid-Autumn / National Day, switches with light/dark)
  │   ├─ VisitorCounter.vue      Settings-page visit stats (read-only view of visitorState)
  │   ├─ WelcomeDialog.vue       Welcome dialog
  │   ├─ Strings/en-US/          English UI strings
  │   └─ styles/                 Home / detail page styles (extracted verbatim from the original HTML)
  ├─ components/ styles/ utils/ assets/   ⛔ WinUIonWeb library (upstream source — see "Hard Rules")
  │                                        └ site assets under `assets/`: icons/ · holiday/ · Fonts/ · AppIcon-*
  │                                          · feedback/ (the two 3D feedback-centre icons)
  │                                          · welcome-sticker.gif (the welcome dialog's artwork)
stats-worker/                    ⛔ NOT in this repo — the self-hosted Cloudflare Worker behind
                                 `service.132614.xyz` (see §4). Its source is kept in the
                                 maintainer's local archive, not committed.
submissions/                     Visitor-submitted app drafts (entry point of the submission flow; do not edit by hand)
scripts/                         Maintenance scripts — `check-updates.mjs` (upstream version checker),
                                 `untracked-buckets.mjs` (the "why isn't this tracked" registry),
                                 `update-ignore.mjs` (edits the ignore list), `upload-webdav.py`
                                 (mirrors dist/ to the OpenList folder) and `icon-sync.py`
                                 (localises slow/heavy app icons into `src/assets/icons/`);
                                 see "CI Notes"
.github/workflows/               The 5 workflows (see "CI Notes")
```

Routes (hash-based):

| Path | Page |
|---|---|
| `#/home` | Home: app card grid (`#/` and unknown paths redirect here) |
| `#/download/:id` | App detail page; `:id` = the `id` field in the data |
| `#/settings` | Settings (appearance / about / visit stats) |
| `#/submit` | Submit a new app |
| `#/tools` | Built-in tools (card list, 11 client-side utilities — searched via the global panel) |
| `#/tools/<id>` | A single built-in tool; routes are generated from the `src/gallery/tools/index.ts` registry |
| `#/ai` | AI nav (21 Chinese AI sites, full-width clickable rows) |
| `#/feedback` | Feedback centre (报告问题 / 提出建议), modelled on the Microsoft Feedback Hub |

---

## 2. Hard Rules (Do / Don't)

1. **To change UI copy, touch only `文字设置.ts`** (and mirror it into
   `src/gallery/Strings/en-US/Resources.ts`). Edit the values inside the quotes only —
   **never the keys on the left** (keys are how pages look copy up; a wrong key means the text vanishes).
2. **To change app data, touch only `软件数据/apps/*.json`.** Do not edit `src/gallery/data/index.ts`
   (that is the loader).
3. **`src/components`, `src/styles`, `src/utils`, `src/assets` are upstream WinUIonWeb source.**
   Keep the directory layout intact so it can be diffed against upstream releases. The one deviation:
   `WinNavigationView` was patched to support **image icons** (put an image URL in a nav item's `icon`;
   the `isIconImage()` test accepts `http(s)://`, `data:image/…` and site-relative `/ ./ ../` — anything
   else is still drawn as a glyph, and a URL that fails the test shows up as literal text in the menu).
   Write page-specific styles as **scoped rules inside the page component** instead.
   Exception: `src/assets/` also holds **site-owned** assets (`icons/`, `holiday/`, `Fonts/`,
   `AppIcon-*`). Keep those in their own files / subfolders so the upstream tree stays diffable.
4. **Never commit `dist/` (already in .gitignore) or `.workbuddy/`.**
5. **Never put credentials in any file of this repo — comments included.** This is a **public repo**:
   writing a secret here publishes it, and once it is in git history it **cannot be taken back**
   (deleting it afterwards does not undo the leak — you have to rotate the secret at the provider).
   All credentials go through repository Secrets (`FTP_*`, `WEBDAV_*`).
6. **Do not commit or push on your own initiative.** The maintainer reviews changes before they are pushed.
   Without an explicit instruction, stay in the working tree: no commit,
   no push, no tags.
7. Commit messages are short Chinese phrases; follow the existing history:
   `chore(version): ...`, `review: approved #12`, `fix: ...`.
8. **Mind the line endings.** There is **no `.gitattributes`** in this repo, so line endings are a
   mix: `src/gallery/pages/SubmitPage.vue` is **CRLF**, while most `.ts` / `.md` / `.json` files are
   **LF**. **Never assume "the whole repo is LF"** — read the file's actual bytes and keep them
   unchanged, or a small edit shows up as a whole-file diff (for example, a 19-line change once appeared as `+1148/-1131` and needed a follow-up commit only
   to restore the line endings).
9. **Keep internal housekeeping out of this repo.** It is public: no "known issues / TODO"
   sections, no notes about past misconfiguration, no sandbox or tooling workarounds, no paths to
   scratch files. Those belong in the maintainer's local notes — everything committed here is
   read by strangers.

---

## 3. Data Contract (`软件数据/apps/*.json`)

Fields and meanings (full reference: `软件数据/README-维护手册.md` and `_模板.json`):

| Field | Meaning |
|---|---|
| `id` | **Unique** ASCII identifier: lowercase letters, digits, hyphens only. URL = `#/download/<id>` |
| `name` | App name |
| `icon` | Icon image URL (square, 256×256 recommended); empty shows a placeholder. ⚠️ Hosted on GitHub / jsDelivr → **also add a 64 px local copy** (see "App icons") |
| `category` | Must be a key from `categories.json`: `system` / `schedule` / `teaching` / `other` |
| `tagline` | One-line summary (home card) |
| `description` | Full description (detail page) |
| `version` `size` `system` | Version / download size / OS limits (e.g. `Windows 10/11（x86 / x64 / ARM64）`) |
| `website` `github` | Homepage / repository URL |
| `notice` | Optional. Renders a **blue banner** above the download list (for apps that update often or have flaky direct links) |
| `store` | Optional. Store URL — adds a "download from the Store" card on the detail page |
| `downloads[]` | Download entries: `{ platform, note?, size?, hash?, url? }` |
| `sort` | Display order, smaller first; omitted means last |
| `维护备注` | Maintainer note; **never rendered on the site** |

Key constraints:

- **`id` must not contain `?` `&` `=` or similar.** Five malformed ids in the original data made the
  detail page show "app not found"; they are fixed as `7-zip` / `9wzdncrfjbmp` / `xpfp7f8rl7mb1w` /
  `xpddvc6xtqqkmm` / `dism-gui`.
- **`downloads[].url` must be a direct file link** (`.exe` / `.zip` / `.msi` …) that starts downloading
  on click — not a vendor download page. If no direct link exists, set that entry's `size` to `网页`
  (web page) and explain in `note`.
- Any `downloads` entry whose `url` points at `apps.microsoft.com` is **auto-detected** and rendered as
  a Store card, so you do not have to add `store` separately (both forms are supported).
- Keep the established platform labels: `Windows x64 安装版` / `Windows x64 便携版` /
  `macOS（Apple 芯片）` / `Linux x64（.deb）` / `Android ARM64（APK）`.
- **Fault tolerance is deliberate**: one broken JSON can never take the site down — the bad file is
  skipped, everything else still renders, and a red bar at the top lists "how many files failed + file
  name + approximate line + reason" (`dataLoadIssues`, see `src/gallery/data/index.ts`). Data edits are safe.
- When collecting data for a new app, **prefer the GitHub REST API (releases/assets)** for real direct
  links and file sizes — far more reliable than guessing. HEAD-check an icon URL before writing it.

### App icons (remote by default, local when it matters)

Icons point at each vendor's own CDN, which is fine for domestic vendors. Icons hosted on **GitHub
(avatars / raw / `github.com/…/raw/…`) or jsDelivr** are however unreliable from mainland China, so those
keep a local copy too:

- `src/assets/icons/<id>.webp` — a **64×64 square** WebP, usually 1–3 KB. **The file name must equal the
  app `id`.** A missing file just falls back to the `icon` URL, so adding one is always safe.
  Two hard requirements: the image must be square (the card/detail CSS uses `object-fit: cover`, which
  centre-crops anything non-square) and ≤ 4096 bytes (that is Vite's default `assetsInlineLimit` for the
  multi-file build — above it the icon becomes an extra request instead of an inlined `data:` URL).
- ⚠️ **Horizontal "logo lockups" (mark + wordmark) must not be letterboxed into the square.** The tile is
  44 px (`home-page.css`) / 72 px (`download-detail-page.css`); a 3.5:1 lockup squeezed into it fills only
  a thin middle strip and reads as a smudge — 火绒's icon did exactly that (58×16 of ink inside 64×64).
  `scripts/icon-sync.py` handles this in `_lockup_mark()`: if the *ink* bounding box is ≥ 2× wider than
  tall it crops the leading square (where the mark is) instead of fitting the whole lockup. Anything it
  does not catch can be fixed by hand: crop the mark, re-save as `<id>.webp`.
- A source with an **opaque** background keeps it (many GitHub avatars and app-store-style squares have
  no alpha). That is faithful to the upstream image — the fix, if wanted, is to change the `icon` URL to a
  transparent PNG and re-run the script, not to key out white in the pipeline.
- Resolution lives in `src/gallery/appIcons.ts`: `appIconUrl()` prefers the local file,
  `appIconUrlSafe()` additionally drops an icon that already failed once in this session.
- `HomePage.vue` / `DownloadDetailPage.vue` **and the left nav pane** (`App.vue`) all render through
  `appIconUrl()`, so the fallback applies everywhere; the pages add `<img loading="lazy"
  referrerpolicy="no-referrer" @error="markIconBroken(app.id)">` and fall back to a first-letter tile —
  a dead icon never leaves a blank hole.
- The single-file build inlines these (they are tiny; `assetsInlineLimit` is 1e8 there), so the offline
  copy carries them as well.

**Refreshing the local copies**: `python scripts/icon-sync.py` (needs Pillow) probes every remote icon and
prints a plan — it picks the ones that are **≥ 16 KB, ≥ 1.5 s to fetch, on a GitHub-family host, or that
failed outright**, plus apps whose `icon` is empty (it tries the site's own favicon). Add `--apply` to
download/convert (`--all` = every remote icon, `--only a,b` = redo specific ones). It always emits 64×64
and tunes the WebP quality down until the file fits the 4096-byte inline budget. It also unwraps
"shell SVGs" (a base64 PNG inside an `<svg>` — 火绒's was 484 KB of that) and falls back to
`verify=False` for CDNs with a broken TLS chain (希沃's `care.seewo.com`), flagging the result as
`证书不校验` rather than letting the card go blank.

---

## 4. Runtime External Dependencies (all self-hosted, no third-party SDK)

| Purpose | Endpoint | Notes |
|---|---|---|
| Visit stats | `https://service.132614.xyz` | Self-hosted CF Worker (**source not in this repo** — local archive only); KV aggregates counts across domains |
| GitHub API proxy | `service.132614.xyz/api/gh/*` | Server-side call that carries the token; reachable from mainland China |
| App submission | `https://cshapi.132614.xyz` → `https://submit.132614.xyz` | Two endpoints tried in order, `POST /api/submit` |

Worker routes: `/api/hit` (PV+1 / UV dedupe / concurrent visitors), `/api/stats` (read-only, used by
local dev), `/api/gh/*` (GitHub proxy), `/` (stats dashboard page).

**Reachability from mainland China is the project's primary constraint**, and it has repeatedly
caused failures:

- `.workers.dev` is **unreachable from mainland China** → every visitor-facing endpoint must use a
  **custom domain**.
- "Import from GitHub" falls back through: site proxy → `api.github.com` → `gh-proxy.com` → `ghfast.top`.
  **The endpoint that worked is remembered in `localStorage['csh-gh-api-base']`** so later calls
  skip unreachable endpoints instead of waiting for their timeouts.
- **Downloading** a GitHub release is the other half of the same problem, and it is handled client-side
  only: `DownloadDetailPage.vue` puts a **blue "加速下载" (Mirror download) button** next to any
  `downloads[].url` that `githubMirror.ts` recognises as a GitHub file link (`releases/download/…` or
  `archive/…` on `github.com`, plus the `*githubusercontent.com` hosts). Tapping it expands the channel
  list — each href is literally `<channel prefix> + <original url>`, never rewritten. Official links and
  every non-GitHub host (vendor sites, netdisks) deliberately show **no** mirror button, so the
  button itself is a reliable "this is GitHub" hint.
  To add or drop a mirror, edit `MIRROR_CHANNELS` in `src/gallery/githubMirror.ts` — nothing else.
  These are **third-party volunteer mirrors**: they relay the file, this site does not, and they do
  go offline without notice. The last channel used is remembered in
  `localStorage['csh-gh-mirror-channel']` and sorted to the front.
  - **Vet every mirror before adding it — never copy a list off the web.** A mirror domain that lapses
    gets **squatted** and starts redirecting to ad pages, which is exactly what happened to
    `gh-proxy.net` (dropped 2026-09-19: `HEAD` → `302 http://survey-smiles.com`, and `GET` returned a
    JS redirect page, so even a browser probe looked "fine"). Checks, in order:
    1. `HEAD <prefix>https://github.com/ip7z/7zip/releases/download/26.03/7z2603-x64.msi` →
       `200` + `Content-Type: application/octet-stream`.
    2. Same URL with `Range: bytes=0-1023` → `206` (it supports resume).
    3. Download one small file in full and compare its sha256 with the official one — proves the
       relay is not tampering with the payload.
    Anything answering `30x` or `text/html` is a dead or hijacked domain: drop it.
- The submit flow falls back the same way; **the working endpoint is remembered in
  `localStorage['csh-submit-endpoint']`**. Per-endpoint timeout is **10 s**, and a failed submission is
  saved to `localStorage['csh-submit-draft']`.
- Unauthenticated `api.github.com` is rate-limited to **60 requests/hour/IP** (one import costs 2).
  → **Before adding any external request, ask: is it reachable from mainland China? What happens if
  it is not?**

Instrumentation lives in `src/gallery/visitor.ts` (reports on root mount and in `router.afterEach`,
deduped per stable page key; `localhost` hits the read-only `/api/stats` so it never pollutes
production counts). Baidu Analytics is injected asynchronously from `index.html`, and SPA route
changes are replayed by `visitor.ts`.

---

## 5. Submission Flow (End to End)

1. A visitor fills in `#/submit` (optionally auto-filled by "Import from GitHub") → `POST /api/submit`
   → the self-hosted Worker writes the JSON into `submissions/<id>.json` in this repo.
   The draft carries the app fields **plus review-only metadata whose keys start with `_`**
   (`_提交时间`, `_原始ID冲突`, `_联系方式`). **Convention: `_`-prefixed key = review-only.** Merging
   strips every such key (`review-submission.yml` filters by prefix, not by name), so a new
   submission-only field can never leak into the published app data — it only shows up in the
   review issue (`create-review-issue.yml` prints `联系方式` explicitly).
   ✅ **Fixed 2026-09-19** — this used to be a known gap: the submission service rebuilt the draft
   from a field whitelist and **dropped `_联系方式`**, so the review issue (issue #28) reported a
   contact as missing even though `SubmitPage.vue` blocks an empty one. The service is a Cloudflare
   Worker named `classhub` (behind `cshapi.132614.xyz` / `submit.132614.xyz`); it now copies
   **every `_`-prefixed key from the request body** into the draft — matched by prefix, not by name —
   while refusing to overwrite the two keys it writes itself (`_提交时间`, `_原始ID冲突`). The same
   patch stopped `downloads[].hash` from being dropped. Source backup: the `submit-worker`
   branch (NOT `main` — do not look for the folder in the working tree); read its README first,
   it is a backup, not a deployment source.
   ⚠️ Drafts submitted **before** that date genuinely lack the key; a missing contact there is
   expected, not a submitter mistake.
   Required before submission: `id`, `name`, `category`, `tagline`, `description`, `system`, a contact
   (`_联系方式`) and **at least one direct download link**. All of it is validated in
   `SubmitPage.vue` → `buildPayload()` — the submit button is not a native submit control, so the
   HTML `required` attribute never fires and validation has to stay in JS.
   Download items also take an **optional checksum** (`下载项 → 校验值`). It is normalized on submit
   (`normalizeHash()`): an `MD5:` / `SHA-256` prefix, `0x`, and byte-separating colons / spaces are
   stripped, because the detail page identifies the algorithm **by hex length alone** (32 / 40 / 56 /
   64 / 96 / 128 → MD5 / SHA-1 / SHA-224 / SHA-256 / SHA-384 / SHA-512) and never from a name.
   ⚠️ `HASH_LENGTHS` in `SubmitPage.vue` must stay in sync with `HASH_ALGORITHMS` in
   `DownloadDetailPage.vue` — a shorter list rejects legitimate SHA-224 / SHA-384 values.
   A non-hex or unknown-length value blocks the submit with its own message (`submit.error-hash`); an
   empty field means the `hash` key is simply omitted from the payload. Re-running "一键读取" keeps
   hashes whose URL did not change.
2. That push triggers `.github/workflows/create-review-issue.yml`, which opens one
   `[待审核] <name> (<id>)` issue per draft that **has no issue yet** — the newly added ones from this
   push, plus any draft that never got one (label `待审核`).
   ⚠️ **Idempotency is keyed on the draft file path, never on the issue title.** The title is
   `<name> (<id>)`, so re-submitting the same app yields the *same* title as the already-closed old
   issue; title-based dedupe then silently swallowed the whole submission. That is exactly what
   happened on 2026-09-20: the second `向日葵远程 (xrkayxingz)` draft was skipped with
   `已存在同名 Issue，跳过：[待审核] 向日葵远程 (xrkayxingz)` because issue #19 (9-18) was closed, so the
   draft sat in `submissions/` forever while the submitter was told "提交成功". Draft paths carry a
   timestamp and are unique per submission. Do not go back to title-based dedupe.
3. A maintainer labels the issue `approved`, `rejected`, or `覆盖已存在` (ASCII alias: `overwrite`) →
   `review-submission.yml` merges the draft into `软件数据/apps/<id>.json` (or deletes it), comments, and
   closes the issue.
   - `approved` **refuses when a file with the same id already exists**: it comments ❌ and stops,
     touching neither the draft nor the published file. That guard is deliberate — it is what keeps a
     mis-click from silently overwriting published data.
   - `覆盖已存在` is the deliberate escape hatch for exactly that case: a **whole-file replace** (icon,
     version and download links all come from the draft). It is not silent — the bot posts a
     field-level before/after diff plus the complete previous file into the issue, and the old version
     also stays recoverable as `git show <parent>:软件数据/apps/<id>.json`. Prefer `rejected` when the
     draft merely carries *less* information than the published file.
   - The step only ever acts on paths under `submissions/` (the issue body is partially submitter-controlled,
     so anything else — including `..` — is rejected outright).
4. Because **pushes made with `GITHUB_TOKEN` do not trigger other workflows** (GitHub's anti-recursion
   rule), step 3 ends by **explicitly dispatching** the deploy with `gh workflow run deploy.yml`.
5. `deploy.yml` builds the single-file bundle and publishes it to **GitHub Pages + FTP + OpenList
   (WebDAV)** at once.

---

## 5.5 Feedback Centre (`#/feedback`)

A nav-pane entry (between **首页** and the category list) opening a page modelled on the Microsoft
Feedback Hub: pick a kind → fill the form → land on a **pre-filled GitHub issue**. There is **no
feedback backend** — the site is static, and the only server-side piece (`submit-worker`) serves
the *submission* flow only, so "POST first, fall back to a link" would always have failed. The
whole feature is therefore **client-side + GitHub's own issue form**: the page collects the text,
then opens
`https://github.com/c1201y/ClassSoftwareHub/issues/new?title=…&body=…&labels=…` in a new tab.

**Two levels of classification** (`src/gallery/feedback.ts`, pure logic, no Vue import):

- `FeedbackKind` — `report` (报告问题) / `suggestion` (提出建议).
- `ReportSubKind` — `interaction` (逻辑交互) / `link` (链接失效) / `other` (其他问题).
  Shown **only for `report`**; a suggestion deliberately carries no sub-kind, so the dropdown
  disappears the moment you switch. `watch(activeKind)` clears `form.subKind` on that switch.

**Six labels, and they must exist in the repo first.** Each submission attaches three at most:
`用户反馈` always, plus the kind, plus (for a report) the sub-kind. ⚠️ GitHub **silently ignores** a
`labels=` value the repo does not have — the issue still opens, just untagged and unfilterable, with
no error anywhere. So the six labels are a **manual one-time setup**: `用户反馈` · `报告问题` ·
`提出建议` · `逻辑交互` · `链接失效` · `其他问题`. A fine-grained PAT **cannot** create them
(`POST /labels` → `403 Resource not accessible by personal access token`), so this cannot be
automated from here. **Rename one side and you must rename it in the repo too** — `feedback.ts` is
the only place the strings live, and the issue body prints the label names as plain text.

The kind/sub-kind `tag` fields are the literal GitHub label names; `titleKey`/`descKey`/`labelKey`
are the i18n keys. **Do not merge the two** — the UI needs localized copy, GitHub needs the ASCII
label.

- JSON, not Markdown-only: the body is assembled from the draft plus, when a `appId` is set, a
  **涉及软件** row carrying the app name, its backticked `id` and a link to
  `https://classsoftwarehub.us.ci/#/download/<id>` (always the main domain — see "SEO & the share
  card"). Free text is the last section.
- **URL length is capped** (`URL_MAX = 7000`): browsers and GitHub both choke on very long `?body=`.
  On overflow the detail is cut with a **binary search** for the longest prefix that still fits
  (never a fixed slice), and a note tells the reader to use the page's "复制反馈内容" button for the
  full text. Copying works even when the tab fails to open.
- **Draft persistence**: `localStorage['csh-feedback-draft']`, restored on mount. ⚠️ It is
  deliberately **not** cleared after a successful open — the new tab is cross-origin, so we cannot
  know whether the user actually submitted; wiping it would destroy text they may still need.
- **Kind icons are 3D PNGs**, not icon-font glyphs: `src/assets/feedback/report.png` (报告问题) and
  `suggest.png` (提出建议), imported in `FeedbackPage.vue` and mapped through `kindIcons`. They are
  deliberately imported (not dropped in `public/`) so `vite-plugin-singlefile` inlines them and the
  offline single-file build still shows them. `feedback.ts` only carries the **word** `report` /
  `suggestion` in its `icon` field — that file stays free of Vue and Vite so it can be verified in
  isolation; the page does the mapping.
  - The artwork is a **compound shape** (a grey document with a coloured badge overlapping its lower
    right). It needs ≥64 px to read: below that the badge collapses into an unreadable dot. Do not
    shrink the card icon back to 48 px.
  - Trimmed to a **square** with equal padding on both axes before scaling — cropping to the raw
    `getbbox()` leaves a portrait rectangle that `object-fit: contain` then letterboxes, which makes
    the two icons render at visibly different sizes side by side.
- Icon-font glyphs are still used for the **chevron** (`\uE76C`) and the **back arrow** (`\uE72B`)
  only. Those codepoints come from the remapped `SEGOEICONS.TTF` subset and were **rendered and
  eyeballed** — `\uE945` looks like a bulb in the docs but renders as a **lightning bolt** here.
  Never trust the codepoint table, check the glyph. The quickest way is to inject a span with
  `font-family:'WinUIOnWebIcons'` into the running page: the `@font-face` lives in `App.vue`'s
  scoped styles, so a standalone probe page cannot load it.
- **The hero banner (帮助改进 ClassSoftwareHub) only renders in the choose-a-kind state** and is
  hidden once a kind is picked — inside the form the specific kind heading already owns that slot.
  Its background is a horizontal gradient over `--accent-fill-rest` → `--card-bg`, deliberately
  built from theme variables rather than a hard-coded dark colour, so it stays legible in both
  light and dark themes. **It is text-only by design** — a decorative illustration on the right was
  tried and removed on request; the three pill-shaped claim tags that briefly took its place
  (`公开可查` / `无账号也能反馈` / `维护者跟进`) were removed too, so the banner is now a single text
  column with **no right-hand column at all** (`.feedback-hero-inner` is not a grid any more). Do not
  put either back — they compete with the cards directly below. Its horizontal padding is
  **28 px, not the usual 36 px** — with nothing filling the right-hand side, 36 px pushes the large
  title markedly further right than the cards below it and reads as a misalignment.
- **Two more choose-state sections sit below the cards** and are easy to miss when editing the
  template, because both are `v-if="!activeKind"` alongside the hero:
  - **提交之后会怎样** — a three-step list (`在本页填写` → `跳转到 GitHub` → `维护者跟进`). It exists
    because the flow otherwise asks the user to give and never shows what they get back. The step
    numbers are drawn by a **CSS counter** (`counter-reset` on the list, `counter-increment` in
    `.feedback-flow-index::before`), so adding or removing a step needs no copy change.
  - **先看看有没有人提过** — a low-key row linking to `REPO_URL + '/issues'`, so people can search
    for a duplicate before filing. It reuses `REPO_URL` exported from `feedback.ts` rather than
    hard-coding the repo again.
- Registering the page in **`SEARCH_PAGES`** (searchIndex.ts) is what makes Ctrl+K find it.
- ⚠️ **The nav entry lives in `footerMenuItems`, not `navMenuItems`.** It was moved there because it
  is a "do something with the site" action like 提交软件, not a content category — sitting among the
  category menu made it read as the Nth software category. `'feedback'` must also be in the
  `pageTags` set or the nav item never lights up, and the `selectedNavigationItem` getter must look
  it up in `footerMenuItems`; leaving that pointing at `navMenuItems` silently drops the highlight.

---

## 6. CI Notes (Read Before Touching Workflows)

- `review-submission.yml` uses `concurrency: { group: review-submission, queue: max }` so concurrent
  reviews are **queued and serialized**. ⚠️ **Do not replace it with `cancel-in-progress: false`** —
  that only keeps "1 running + 1 pending", and a new pending run **evicts** the old one, so **batch
  reviews silently lose entries** (two review batches were lost this way). A `pull --rebase` retry loop backs up the
  push as well.
- `create-review-issue.yml` computes its diff range from the event's own `before` / `after` SHAs.
  ⚠️ **Do not go back to `git diff HEAD~1 HEAD`** — checkout lands on the tip fetched at that moment,
  so two closely spaced pushes either duplicate an issue or **create none at all** (the draft then sits
  in `submissions/` indefinitely). That is also why `fetch-depth: 0` is required.
- `deploy.yml` builds **once** in the `build` job (`npm run build`, multi-file) and passes the
  artifact to the three upload jobs (previously every upload job rebuilt on its own, consuming extra runner minutes).
  The artifact is the whole `dist/` — `index.html`, the `public/` copies, and an `assets/` folder of
  content-hashed, per-route chunks (~66 chunks in `assets/`, ~2 MB; ~72 files in `dist/` overall).
  - **Pages** takes `dist/` as-is. **FTP** mirrors it (FTP-Deploy-Action also deletes remote files
    that are no longer in `dist/`, so stale hashed chunks do not pile up).
  - **OpenList (WebDAV)** runs `scripts/upload-webdav.py`: mkcol → PUT every file → verify → prune.
    Uploads are **raw** — no zip / tar / gzip — so the remote folder stays a browsable copy of the
    site. The prune pass only cleans folders the build itself produced (`assets/`); it never touches
    the target root, which may hold files we do not own. Every request retries, and the job keeps
    `continue-on-error` because that host occasionally drops connections.
  - ⚠️ `index.html` must keep referencing its assets **relatively** (`vite.config.ts` sets
    `base: './'`): the OpenList copy lives in a sub-folder (`网站/`), where an absolute `/assets/…`
    would 404. Hash routing (the document path never changes) is what makes one build work at both
    depths. The same file also sanitises chunk names to ASCII — a Chinese module filename
    (`AI导航文本.ts`) would otherwise emit `assets/AI导航文本-xxxx.js`, and some servers mishandle
    percent-encoded paths.
- All five workflows carry Chinese comments explaining *why* they are written this way —
  **read those comments before changing anything.**
- `check-updates.yml` runs `scripts/check-updates.mjs` **every Friday** (and on demand), comparing
  `软件数据/apps/*.json` against upstream, and **splitting the outcome in two**:
  - what the script can prove → written back, committed and deployed **automatically** (the scheduled
    run applies by default; `workflow_dispatch` also defaults `apply=true`);
  - what it cannot prove → one rolling issue, `软件信息体检 · 待人工确认`, listing each case with a
    title, one line of "why the script stayed put", and **three checkboxes**:
    - **"已改好 → 重新检测"** — the maintainer fixes the JSON *elsewhere* (web edit, or locally then
      push), commits, then ticks this; the workflow just re-runs the whole check to verify. This path
      reads and writes nothing in the repo. The re-run is queued, not instant — the answer arrives a
      couple of minutes later, and a correct fix makes the entry disappear.
    - **"本次跳过"** — *not now*: mutes **this version of the problem** only. The tick carries a hidden
      **problem fingerprint** (12 hex chars, computed by `pendingKey()` from the affected URLs / the
      upstream tag / the blocker kinds) which the workflow copies into `_skip_once` in
      `软件数据/update-ignore.json`. The next run stays quiet **only while the fingerprint still
      matches** — the moment upstream ships a new version or the dead links change, the entry comes
      back by itself. This exists because "permanently ignore" used to be the only alternative to
      being nagged every Friday, so people muted things they merely wanted to defer. The fingerprint
      deliberately excludes HTTP status codes: a 403/404 flapping on a flaky network is not "the
      situation changed".
    - **"不用跟进"** — ticking it once mutes that entry forever (`/ignore <id>` in a comment does the
      same).
    Detailed "how to fix it by hand" steps sit in a collapsed `<details>` block. When nothing is pending
    the issue **closes itself**. The full report always goes to the Job Summary.

  **One leg: GitHub Releases** (the `github` field). There used to be a second leg — a registry of
  **non-GitHub official sources** that scraped vendor pages (the seewo product list, the VideoLAN
  directory, the 360 download pages, the DiskGenius changelog, a GeoGebra redirect) for the ten apps
  with no repo. It was **deleted outright on 2026-09-21**: every vendor redesign meant another parser to
  fix, and the upkeep outweighed the payoff. Those ten apps now sit in the *web page only* bucket of
  `scripts/untracked-buckets.mjs` with an honest reason attached. (Recovering it means reverting the
  commit — the scraper gotchas, if it ever comes back: strip HTML comments *before* parsing
  (`browser.360.cn/ee/` carries two `id="loadnew"` anchors and the first one, in a comment, points at
  the previous release); use `redirect: 'manual'` when a redirect is the version source, or you download
  a 130 MB installer just to read a filename; and a source that cannot prove itself — the version number
  must actually appear in the download filename, and every returned URL must pass a hard-coded host
  allow-list — becomes a pending item instead of touching data.

  Whatever the GitHub leg cannot reach is **labelled, not hidden**: `classify()` sorts those apps into
  *Microsoft Store*, *official always-latest link*, *deliberately archived*, *web page only* and
  *netdisk*, and the issue lists the whole taxonomy (`## 跟不了`) with a per-app reason. Before
  this, ~38 apps vanished into one "not checked" bucket, so "the Store updates itself" looked identical
  to "the page is an SPA we cannot parse" — and nobody could tell how much of the catalogue was really
  covered. Those apps deliberately do **not** produce pending items: they are not "pending", they are
  "not trackable by design", and a checkbox nobody can ever act on is just noise. New apps with no repo
  should be added to `BUCKETS` when they are submitted, so this list stays truthful.

  The issue body stays **deliberately terse** — one line of counts at the top, then only the items that
  need a human; auto-updated, untrackable, ignored and the full tally all live inside `<details>`. Keep
  it that way when you touch `buildPendingReport()`: no "summary" sub-heading, and never print the same
  set of numbers twice. Safe to restructure, because the workflow locates the issue by **title** and
  parses only the `<!-- action:id=… -->` markers — it never reads the headings.

  **Exactly one set of numbers, and it has to add up.** `reconcile()` sorts every app into four
  mutually exclusive buckets — *needs you* / *auto-fixed this run* / *tracked, nothing to do* /
  *not trackable by design* — and the last one is derived by subtraction so the four always sum to
  the catalogue size (a mismatch logs `账目不平`). Both the top line and the closing `本次账目` table
  print **that** breakdown, together with the app ids, so a reader can check the arithmetic. Before
  this, the top line had its own four counters while the footer printed a *different* set of state
  counters, and they disagreed three ways at once: `要你裁决` counted **items after the ignore-list
  filter** whereas `需人工` counted **apps including ignored ones** ("2" versus "1", with nothing
  explaining the gap — the two extras were muted apps); `已自动更新` was a post-write fact while
  `站内落后` was a pre-check snapshot; and one app can legitimately sit in both (vlc: download links
  auto-fixed, vendor page still down, so it appeared as "auto-updated" *and* "still pending"). One
  line of `体检状态细分` is still allowed, but it must state explicitly that it is **another view of
  the same apps, not additional counts**.

  The safety rule is **all-or-nothing**: an app's `version` and its download links are one unit, so a
  single unsolvable point blocks the whole entry (otherwise you get "version 26.03, link still on the
  26.02 file"). Blockers: cross-major bumps, download items that carry a checksum (the `hash` field,
  or a SHA512/256 written into `note`) — swapping the file invalidates it — plus asset filenames that
  changed upstream, unresolvable `github`
  slugs, dead links, and versions that are not comparable strings (e.g. `上次更新日期 2026/8/18`).
  Non-GitHub links are rewritten **only** when a registered source explicitly hands back a new URL;
  everything else (vendor pages, mirrors) is never touched — only reported. That report is its
  **own** pending kind (`stale`), deliberately *not* attached to a bump: while it hung off the bump
  entry, the notice disappeared the moment the script finished the upgrade by itself, so the vendor link
  stayed stale with no visible warning (this is how the two `7-zip.org` links on 7-Zip went stale).
  After writing anything back it must dispatch `deploy.yml` explicitly (same `GITHUB_TOKEN`
  suppression rule as above). The script rewrites each JSON file individually to **preserve its
  original line endings** — see Hard Rule 8.
- `update-ignore-command.yml` is what makes review actions work. It has **two entry points**:
  - `tick` job — the checkboxes. Ticking one edits the issue body → `issues.edited`; the job diffs
    `changes.body.from` against the new body and acts on rows that went `[ ]` → `[x]` only, so it is
    idempotent and cannot re-fire on its own rewrite (also filtered by `sender != github-actions[bot]`).
    `ignore` / `unignore` / `skip` / `unskip` ticks go through `scripts/update-ignore.mjs` into
    `软件数据/update-ignore.json` (`skip` also carries the fingerprint, arriving as `id=key`);
    a `recheck` tick skips checkout and Node entirely and just dispatches
    `check-updates.yml`. ⚠️ That dispatch must always be a **full** run — never pass `--only` from
    there, because `update-pending.md` is a global snapshot and a partial one would be written over the
    issue body, wiping every other entry. (The issue step now refuses to touch the issue at all once
    `inputs.only` is set; before, it only guarded the "0 pending" case.)
    The app id travels in a hidden `<!-- ignore:id=xx -->` / `<!-- unignore:id=xx -->` /
    `<!-- recheck:id=xx -->` HTML comment emitted by `tick()` in `scripts/check-updates.mjs`, plus
    `<!-- skip:id=xx key=<12-hex> -->` / `<!-- unskip:id=xx -->` from `tick2()` — the fingerprint has
    to ride along inside the comment because the workflow can never compute it (it does not see the
    check result). **change one side and you must change the other**.
 Not needing an extra auth gate is deliberate:
    the issue is bot-authored, so only users with write access can edit its body at all.
  - `ignore` job — the fallback `/ignore` / `/unignore` comments. ⚠️ The repo is public, so **anyone**
    can comment — the job is gated on three conditions (it must be *that* issue / the commenter must
    have write access / the body must start with `/ignore` or `/unignore`). Do not relax them. The
    comment body arrives via an env var and is parsed by bash's own word splitting — **do not switch
    back to `cut -d' ' -f2`**: when the delimiter is absent it returns the whole line, which would
    record `/ignore` itself as an app id.

---

## 7. Versioning & Releases (new rules as of 2026-09-15)

- Public version: `X.Y.Z` + a **codename suffix, which is kept** (e.g. `- Autumn`).
  X = major (architecture / UI overhaul); Y = feature update; Z = small fix.
- Internal version: `AAAABBCCPRDD` (year / month / day / file revision), e.g. `20260915PR01`.
- Update all of these together — current value is `v2.3.3 - Tangram (20260924PR01)`:
  - `文字设置.ts` → `app.version`, `home.subtitle`, `welcome.intro` (**3 places**)
  - `src/gallery/Strings/en-US/Resources.ts` → `app.version`
  - `package.json` → `version` (bare `2.3.3`, no codename / internal number); also bump the two `"version"` fields
  at the top of `package-lock.json` (npm normally syncs these)
- The codename is part of the public version string and **may be an English phrase**
  (`- Autumn`, `- September 18 Incident`) — the suffix stays in user-facing copy.
- Release tags are named `vX.Y.Z-<codename>`. The six so far: `v2.0.0-Autumn`, `v2.1.0-Autumn`,
  `v2.2.0-Autumn`, `v2.3.0-Autumn`, `v2.3.1-Autumn`, `v2.3.2-Tangram`. ⚠️ That suffix is a
  **codename, not necessarily the release headline**: `v2.3.0-Autumn` is correct even though the
  CHANGELOG entry for that release is titled `v2.3.0 - September 18 Incident`. Do **not** build a tag
  by concatenating the headline — `v2.3.0-September18Incident` was created once that way and had to
  be deleted. (`v2.3.2-Tangram` carries the version codename, which happens to match its CHANGELOG
  headline.)
  A tag points at the **last commit of that version's cycle**, not at the commit that bumped the
  version — `v2.2.0-Autumn` is the AGENTS.md commit, `v2.1.0-Autumn` is the
  `docs: 添加 v2.1.0 更新日志` commit.
- `CHANGELOG.md` is maintained by hand; **whether it ships with a commit is the maintainer's call**
  (there is precedent for keeping it local-only).

---

## 8. Common Tasks

**Adding an app**
1. Copy `软件数据/apps/_模板.json` to `<id>.json`.
2. Use the GitHub REST API (releases/assets) for real direct links and sizes; HEAD-check the `icon` URL.
3. Run `npm run dev` to check the home and detail pages, then `npm run type-check`.
4. For paid or licence-restricted software, spell out the restriction in `notice` or `description`
   (e.g. Bulk Rename Utility: free for personal use, paid for commercial).

**Updating an existing app's version / links**: run
`node scripts/check-updates.mjs --report=out.md --pending=pending.md` (add `--only=id1,id2` to narrow
it, `--no-link` to skip the download-link liveness check). Add `--apply` to write back what the script
can prove; anything it cannot prove lands in `pending.md` instead. Export `GITHUB_TOKEN` first or you
hit the 60-requests/hour anonymous limit. This is exactly what the weekly
`.github/workflows/check-updates.yml` run does — see "CI Notes".
⚠️ A narrowed run (`--only`) **never writes the ignore list** — `pending.md` from it is a partial
snapshot, and letting it prune `_skip_once` would silently wipe every "skip this once" record.

**Why an app isn't tracked**: `scripts/untracked-buckets.mjs` is the single registry — a static table of
`{bucket, reason}` plus `classify()`. It makes no network calls. Every app without a usable GitHub repo
falls into one of five buckets (`store` / `always-latest` / `archive` / `page-only` / `netdisk`), and
only `page-only` genuinely needs a human to glance at it now and then. When you retire an app from
tracking, register it here with an honest reason rather than leaving it silently unexamined.

**After fixing an entry by hand**: you do not edit anything from the issue — fix
`软件数据/apps/<id>.json` wherever you like, **commit**, then tick "已改好 → 重新检测" under that entry.
That dispatches a full check, and the entry disappears if the fix holds. No further steps are required.

**Muting an update nag forever**: tick "不用跟进" under that entry in the health-check issue (one
click, nothing to type) — or reply `/ignore <id> [updates|all] [reason]`, or run
`node scripts/update-ignore.mjs --add=<id> --skip=updates --reason="..."` locally
(`--list` and `--remove=<id>` also work). An entry can be restored by ticking its "restore" checkbox in the
issue's collapsed *ignored* section. Records live in `软件数据/update-ignore.json`: `updates`
stops reporting version/repo problems but still reports dead links; `all` reports nothing at all.

**Deferring instead of muting**: "本次跳过" writes `--skip-once=<id> --key=<fingerprint>` into the same
file's `_skip_once` key (keys starting with `_` are comments as far as `loadIgnore()` is concerned, so
this never leaks into the ignore entries). `check-updates.mjs` prunes dead records on `--apply`; that is
why `check-updates.yml` commits `软件数据/update-ignore.json` alongside `软件数据/apps`.

**Extending the search**: result matching lives in `src/gallery/searchIndex.ts` (`searchApps` /
`searchTools` / `searchAiSites` / `searchPages` → `searchGlobal`); the panel that renders it is
`src/gallery/GlobalSearch.vue`; every label is a `search.*` key in `文字设置.ts`. New pages to be
searchable go into the `SEARCH_PAGES` table in `searchIndex.ts` (title + description are i18n keys).

**Changing site copy**: only `文字设置.ts` (plus the English file) — never touch the keys.

**SEO & the share card**: everything a crawler or chat app can read *without running JS* lives in
`index.html` (`description` / `keywords` / `canonical` / Open Graph / Twitter card / JSON-LD) plus
files in `public/` — `robots.txt`, `sitemap.xml`, `favicon.ico`, and `og-cover.png` (1200×630, the
preview image shown when the link is posted in QQ / WeChat). **Every absolute URL in these files must
use the main domain `https://classsoftwarehub.us.ci/`** — Bing rejects a sitemap that lists another
domain ("not contained in this site"); the two mirrors (132614.xyz / xfane.com) are folded into the
main domain by `canonical`. Vite copies `public/` verbatim into
`dist/`, so all three deploy targets (Pages · FTP · OpenList) carry them.
Keep this copy in step with the real site — search engines index the static `<title>`/`description`
and the `<noscript>` block, **not** the runtime i18n strings. Two limits worth repeating: the site
uses **hash routing**, so `/#/download/<id>` is not a distinct URL to a crawler (only the home page
is listable, which is why `sitemap.xml` has a single entry), and the app is fully client-rendered,
so the `<noscript>` body is all a non-JS crawler sees. Swapping the cover is just PNG-in,
PNG-out at the same path.

**Site did not update after deployment**: first verify that `deploy.yml` actually ran. A push made
with `GITHUB_TOKEN` never triggers it, so post-review deploys rely on the explicit
`gh workflow run deploy.yml` dispatch.

**Some regions cannot open the site**: this is a mainland-reachability issue. Check for
blocked domains such as `.workers.dev`. The main site is served from SpeedOnline Hong Kong, while the
submission path goes through Cloudflare.

---

## Appendix: Sandbox Notes (optional, sandbox-only)

Inside the WorkBuddy sandbox: `ls` / `head` / `rm` / `cat` may be missing (fall back to the managed
Python interpreter); git over HTTPS also fails on a certificate-revocation check until the proxy's
own root certificate is merged into a CA bundle (`http.sslBackend=openssl` + `http.sslCAInfo`;
`sslVerify=false` is not the fix); **`git rebase` is forbidden**. The rest of the workarounds lives
in the local notes under `.workbuddy/memory/` (that directory is not committed).
