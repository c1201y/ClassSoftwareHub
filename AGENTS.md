# AGENTS.md — ClassSoftwareHub Project Guide

> Source repository of the *ClassSoftwareHub* download site for classroom-PC administrators
> (电教委员). A Vue 3 + Vite + TypeScript single-page app whose UI is built on the open-source
> **WinUIonWeb** component library. The site serves **classroom computers / AV-equipment admins**
> and curates with a clear bias: **no ads, no bundled junk, open source first**.
>
> This file is the minimum context an AI agent (or a new contributor) needs. **Read it before
> touching anything** — especially "Hard Rules" and "Directory Map". `README.md` is written for
> content maintainers; this file is written for people changing code.

---

## 0. At a Glance

| | |
|---|---|
| Stack | Vue 3.5 + Vue Router 4 (**hash routing**) + Vite 8 + TypeScript. Pure static front end, no backend |
| Boot path | `index.html` → `src/main.ts` → `src/gallery/App.vue` (shell) → `src/gallery/router.ts` (7 routes: home / detail / settings / submit / tools / single tool / AI nav) |
| App code | Everything lives in `src/gallery/` — **the only place you should change code** |
| Data | `软件数据/apps/*.json` (one file per app, 60 today) + `软件数据/categories.json` (4 categories) |
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
  │   ├─ router.ts               The 7 routes (table below)
  │   ├─ pages/                  HomePage / DownloadDetailPage / SettingsPage / SubmitPage / AiNavPage
  │   ├─ tools/                  ★ Built-in tools: index.ts registry + ToolShell.vue + one .vue per tool
  │   │                           (adding a tool = one registry entry; its route is generated from it)
  │   ├─ aiSiteIcons.ts          Site icons for the AI-nav page (inlined base64, no third-party icon service)
  │   ├─ appIcons.ts             ★ App-icon resolver: prefers the local 64 px copy, falls back to the `icon` URL
  │   ├─ data/index.ts           Data loader: types + fault-tolerant parsing (⚠️ do not edit)
  │   ├─ githubImport.ts         "Import from GitHub" (从 GitHub 一键读取) on the submit page
  │   ├─ searchIndex.ts          Title-bar search (matches name + tagline + description)
  │   ├─ visitor.ts              Self-hosted visit counter + Baidu Analytics SPA pageview replay
  │   ├─ holidayTheme.ts         Holiday skin (Mid-Autumn / National Day, switches with light/dark)
  │   ├─ VisitorCounter.vue      Settings-page visit stats (read-only view of visitorState)
  │   ├─ WelcomeDialog.vue       Welcome dialog
  │   ├─ Strings/en-US/          English UI strings
  │   └─ styles/                 Home / detail page styles (extracted verbatim from the original HTML)
  ├─ components/ styles/ utils/ assets/   ⛔ WinUIonWeb library (upstream source — see "Hard Rules")
  │                                        └ site assets under `assets/`: icons/ · holiday/ · Fonts/ · AppIcon-*
stats-worker/
  ├─ worker.js                   Cloudflare Worker: visit stats + GitHub API proxy (600+ lines)
  └─ wrangler.toml               Deploy config (KV binding: STATS)
submissions/                     Visitor-submitted app drafts (submission-flow entry; don't hand-edit)
scripts/                         Maintenance scripts — `check-updates.mjs` (upstream version checker),
                                 `update-ignore.mjs` (edits the ignore list) and `upload-webdav.py`
                                 (mirrors dist/ to the OpenList folder); see "CI Notes"
.github/workflows/               The 5 workflows (see "CI Notes")
```

Routes (hash-based):

| Path | Page |
|---|---|
| `#/home` | Home: app card grid (`#/` and unknown paths redirect here) |
| `#/download/:id` | App detail page; `:id` = the `id` field in the data |
| `#/settings` | Settings (appearance / about / visit stats) |
| `#/submit` | Submit a new app |
| `#/tools` | Built-in tools (searchable card list, 11 client-side utilities) |
| `#/tools/<id>` | A single built-in tool; routes are generated from the `src/gallery/tools/index.ts` registry |
| `#/ai` | AI nav (21 Chinese AI sites, full-width clickable rows) |

---

## 2. Hard Rules (Do / Don't)

1. **To change UI copy, touch only `文字设置.ts`** (and mirror it into
   `src/gallery/Strings/en-US/Resources.ts`). Edit the values inside the quotes only —
   **never the keys on the left** (keys are how pages look copy up; a wrong key means the text vanishes).
2. **To change app data, touch only `软件数据/apps/*.json`.** Do not edit `src/gallery/data/index.ts`
   (that is the loader).
3. **`src/components`, `src/styles`, `src/utils`, `src/assets` are upstream WinUIonWeb source.**
   Keep the directory layout intact so it can be diffed against upstream releases. The one deviation:
   `WinNavigationView` was patched to support **image icons** (put an image URL in a nav item's `icon`).
   Write page-specific styles as **scoped rules inside the page component** instead.
   Exception: `src/assets/` also holds **site-owned** assets (`icons/`, `holiday/`, `Fonts/`,
   `AppIcon-*`). Keep those in their own files / subfolders so the upstream tree stays diffable.
4. **Never commit `dist/` (already in .gitignore) or `.workbuddy/`.**
5. **Never put credentials in any file of this repo — comments included.** This is a **public repo**:
   writing a secret here publishes it, and once it is in git history it **cannot be taken back**
   (deleting it afterwards does not undo the leak — you have to rotate the secret at the provider).
   All credentials go through repository Secrets (`FTP_*`, `WEBDAV_*`).
6. **Do not commit or push on your own initiative.** The maintainer's workflow is "change files,
   let me look, then push". Without an explicit instruction, stay in the working tree: no commit,
   no push, no tags.
7. Commit messages are short Chinese phrases; follow the existing history:
   `chore(version): ...`, `review: approved #12`, `fix: ...`.
8. **Mind the line endings.** There is **no `.gitattributes`** in this repo, so line endings are a
   mix: `src/gallery/pages/SubmitPage.vue` is **CRLF**, while most `.ts` / `.md` / `.json` files are
   **LF**. **Never assume "the whole repo is LF"** — read the file's actual bytes and keep them
   unchanged, or a small edit shows up as a whole-file diff (this really happened: a 19-line change
   was reported as `+1148/-1131` and needed a follow-up commit just to restore the line endings).
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
| `downloads[]` | Download entries: `{ platform, note?, size?, url? }` |
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
  name + approximate line + reason" (`dataLoadIssues`, see `src/gallery/data/index.ts`). Don't be afraid
  to edit data.
- When collecting data for a new app, **prefer the GitHub REST API (releases/assets)** for real direct
  links and file sizes — far more reliable than guessing. HEAD-check an icon URL before writing it.

### App icons (remote by default, local when it matters)

Icons point at each vendor's own CDN, which is fine for domestic vendors. Icons hosted on **GitHub
(avatars / raw / `github.com/…/raw/…`) or jsDelivr** are however unreliable from mainland China, so those
keep a local copy too:

- `src/assets/icons/<id>.webp` — a 64×64 WebP, usually 1–3 KB. **The file name must equal the app `id`.**
  A missing file just falls back to the `icon` URL, so adding one is always safe.
- Resolution lives in `src/gallery/appIcons.ts`: `appIconUrl()` prefers the local file,
  `appIconUrlSafe()` additionally drops an icon that already failed once in this session.
- `HomePage.vue` / `DownloadDetailPage.vue` render `<img loading="lazy" referrerpolicy="no-referrer"
  @error="markIconBroken(app.id)">` and fall back to a first-letter tile — a dead icon never leaves a
  blank hole.
- The single-file build inlines these (they are tiny; `assetsInlineLimit` is 1e8 there), so the offline
  copy carries them as well.

---

## 4. Runtime External Dependencies (all self-hosted, no third-party SDK)

| Purpose | Endpoint | Notes |
|---|---|---|
| Visit stats | `https://service.132614.xyz` | Self-hosted CF Worker (`stats-worker/worker.js`); KV aggregates counts across domains |
| GitHub API proxy | `service.132614.xyz/api/gh/*` | Server-side call that carries the token; reachable from mainland China |
| App submission | `https://cshapi.132614.xyz` → `https://submit.132614.xyz` | Two endpoints tried in order, `POST /api/submit` |

Worker routes: `/api/hit` (PV+1 / UV dedupe / concurrent visitors), `/api/stats` (read-only, used by
local dev), `/api/gh/*` (GitHub proxy), `/` (stats dashboard page).

**Reachability from mainland China is this project's number-one constraint** — it has bitten us
repeatedly:

- `.workers.dev` is **unreachable from mainland China** → every visitor-facing endpoint must use a
  **custom domain**.
- "Import from GitHub" falls back through: site proxy → `api.github.com` → `gh-proxy.com` → `ghfast.top`.
  **The endpoint that worked is remembered in `localStorage['csh-gh-api-base']`** so the next call
  skips the dead ones instead of waiting out the timeout.
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
   Required before submission: `id`, `name`, `category`, `tagline`, `description`, a contact
   (`_联系方式`) and **at least one direct download link**. All of it is validated in
   `SubmitPage.vue` → `buildPayload()` — the submit button is not a native submit control, so the
   HTML `required` attribute never fires and validation has to stay in JS.
2. That push triggers `.github/workflows/create-review-issue.yml`, which opens one
   `[待审核] <name> (<id>)` issue per **newly added** draft (label `待审核`; duplicate titles are skipped
   idempotently).
3. A maintainer labels the issue `approved` or `rejected` → `review-submission.yml` merges the draft into
   `软件数据/apps/<id>.json` (or deletes it), comments, and closes the issue.
4. Because **pushes made with `GITHUB_TOKEN` do not trigger other workflows** (GitHub's anti-recursion
   rule), step 3 ends by **explicitly dispatching** the deploy with `gh workflow run deploy.yml`.
5. `deploy.yml` builds the single-file bundle and publishes it to **GitHub Pages + FTP + OpenList
   (WebDAV)** at once.

---

## 6. CI Notes (Read Before Touching Workflows)

- `review-submission.yml` uses `concurrency: { group: review-submission, queue: max }` so concurrent
  reviews are **queued and serialized**. ⚠️ **Do not replace it with `cancel-in-progress: false`** —
  that only keeps "1 running + 1 pending", and a new pending run **evicts** the old one, so **batch
  reviews silently lose entries** (we have lost 2 that way). A `pull --rebase` retry loop backs up the
  push as well.
- `create-review-issue.yml` computes its diff range from the event's own `before` / `after` SHAs.
  ⚠️ **Do not go back to `git diff HEAD~1 HEAD`** — checkout lands on the tip fetched at that moment,
  so two pushes close together either duplicate an issue or **create none at all** (the draft sits in
  `submissions/` forever). That is also why `fetch-depth: 0` is required.
- `deploy.yml` builds **once** in the `build` job (`npm run build`, multi-file) and passes the
  artifact to the three upload jobs (previously each uploaded job rebuilt, burning runner minutes).
  The artifact is the whole `dist/` — `index.html` plus an `assets/` folder of content-hashed,
  per-route chunks (~66 files, ~2 MB total).
  - **Pages** takes `dist/` as-is. **FTP** mirrors it (FTP-Deploy-Action also deletes remote files
    that are no longer in `dist/`, so stale hashed chunks do not pile up).
  - **OpenList (WebDAV)** runs `scripts/upload-webdav.py`: mkcol → PUT every file → verify → prune.
    Uploads are **raw** — no zip / tar / gzip — so the remote folder stays a browsable copy of the
    site. The prune pass only cleans folders the build itself produced (`assets/`); it never touches
    the target root, which may hold files we do not own. Every request retries, and the job keeps
    `continue-on-error` because that host is a small box that occasionally drops connections.
  - ⚠️ `index.html` must keep referencing its assets **relatively** (`vite.config.ts` sets
    `base: './'`): the OpenList copy lives in a sub-folder (`网站/`), where an absolute `/assets/…`
    would 404. Hash routing (the document path never changes) is what makes one build work at both
    depths. The same file also sanitises chunk names to ASCII — a Chinese module filename
    (`AI导航文本.ts`) would otherwise emit `assets/AI导航文本-xxxx.js`, and some servers mishandle
    percent-encoded paths.
- All five workflows carry Chinese comments explaining *why* they are written this way —
  **read those comments before changing anything.**
- `check-updates.yml` runs `scripts/check-updates.mjs` **every Friday** (and on demand), comparing
  `软件数据/apps/*.json` against upstream GitHub releases, and **splits the outcome in two**:
  - what the script can prove → written back, committed and deployed **automatically** (the scheduled
    run applies by default; `workflow_dispatch` also defaults `apply=true`);
  - what it cannot prove → one rolling issue, `📦 软件信息体检 · 待人工确认`, listing each case with a
    title, one line of "why the script stayed put", and **two checkboxes**:
    - **"已改好 → 重新检测"** — the maintainer fixes the JSON *elsewhere* (web edit, or locally then
      push), commits, then ticks this; the workflow just re-runs the whole check to verify. This path
      reads and writes nothing in the repo. The re-run is queued, not instant — the answer arrives a
      couple of minutes later, and a correct fix makes the entry disappear.
    - **"不用跟进"** — ticking it once mutes that entry forever (`/ignore <id>` in a comment does the
      same).
    Detailed "how to fix it by hand" steps sit in a collapsed `<details>` block. When nothing is pending
    the issue **closes itself**. The full report always goes to the Job Summary.
  The safety rule is **all-or-nothing**: an app's `version` and its download links are one unit, so a
  single unsolvable point blocks the whole entry (otherwise you get "version 26.03, link still on the
  26.02 file"). Blockers: cross-major bumps, download items whose `note` carries a SHA512/256 checksum
  (swapping the file invalidates it), asset filenames that changed upstream, unresolvable `github`
  slugs, dead links, and versions that are not comparable strings (e.g. `上次更新日期 2026/8/18`).
  Non-GitHub links (vendor sites, mirrors) are **never** touched — only reported. That report is its
  **own** pending kind (`stale`), deliberately *not* attached to a bump: while it hung off the bump
  entry, the notice disappeared the moment the script finished the upgrade by itself, so the vendor
  link stayed stale with nobody the wiser (7-Zip lost its two `7-zip.org` links exactly that way).
  After writing anything back it must dispatch `deploy.yml` explicitly (same `GITHUB_TOKEN`
  suppression rule as above). The script rewrites each JSON file individually to **preserve its
  original line endings** — see Hard Rule 8.
- `update-ignore-command.yml` is what makes review actions work. It has **two entry points**:
  - `tick` job — the checkboxes. Ticking one edits the issue body → `issues.edited`; the job diffs
    `changes.body.from` against the new body and acts on rows that went `[ ]` → `[x]` only, so it is
    idempotent and cannot re-fire on its own rewrite (also filtered by `sender != github-actions[bot]`).
    `ignore` / `unignore` ticks go through `scripts/update-ignore.mjs` into
    `软件数据/update-ignore.json`; a `recheck` tick skips checkout and Node entirely and just dispatches
    `check-updates.yml`. ⚠️ That dispatch must always be a **full** run — never pass `--only` from
    there, because `update-pending.md` is a global snapshot and a partial one would be written over the
    issue body, wiping every other entry. (The issue step now refuses to touch the issue at all once
    `inputs.only` is set; before, it only guarded the "0 pending" case.)
    The app id travels in a hidden `<!-- ignore:id=xx -->` / `<!-- unignore:id=xx -->` /
    `<!-- recheck:id=xx -->` HTML comment emitted by `tick()` in `scripts/check-updates.mjs` —
    **change one side and you must change the other**. Not needing an extra auth gate is deliberate:
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
- Update all of these together — current value is `v2.3.1 - September 18 Incident (20260917PR05)`:
  - `文字设置.ts` → `app.version`, `home.subtitle`, `welcome.intro` (**3 places**)
  - `src/gallery/Strings/en-US/Resources.ts` → `app.version`
  - `package.json` → `version` (bare `2.3.1`, no codename / internal number); also bump the two `"version"` fields
  at the top of `package-lock.json` (npm normally syncs these)
- The codename is part of the public version string and **may be an English phrase**
  (`- Autumn`, `- September 18 Incident`) — the suffix stays in user-facing copy.
- Release tags are named `vX.Y.Z-<season codename>` — `-Autumn` for every release so far
  (`v2.0.0-Autumn`, `v2.1.0-Autumn`, `v2.2.0-Autumn`, `v2.3.0-Autumn`). ⚠️ That suffix is the
  **season codename, not the release headline**: `v2.3.0-Autumn` is correct even though the CHANGELOG
  entry for that release is titled `v2.3.0 - September 18 Incident`. Do **not** build a tag out of the
  headline — `v2.3.0-September18Incident` was created once that way and had to be deleted.
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

**After fixing an entry by hand**: you do not edit anything from the issue — fix
`软件数据/apps/<id>.json` wherever you like, **commit**, then tick "已改好 → 重新检测" under that entry.
That dispatches a full check, and the entry disappears if the fix holds. Nothing else to remember.

**Muting an update nag forever**: tick "不用跟进" under that entry in the health-check issue (one
click, nothing to type) — or reply `/ignore <id> [updates|all] [reason]`, or run
`node scripts/update-ignore.mjs --add=<id> --skip=updates --reason="..."` locally
(`--list` and `--remove=<id>` also work). Untick-by-hand is offered as a "restore" checkbox in the
issue's collapsed *ignored* section. Records live in `软件数据/update-ignore.json`: `updates`
stops reporting version/repo problems but still reports dead links; `all` reports nothing at all.

**Changing site copy**: only `文字设置.ts` (plus the English file) — never touch the keys.

**SEO & the share card**: everything a crawler or chat app can read *without running JS* lives in
`index.html` (`description` / `keywords` / `canonical` / Open Graph / Twitter card / JSON-LD) plus
files in `public/` — `robots.txt`, `sitemap.xml`, `favicon.ico`, and `og-cover.png` (1200×630, the
preview image shown when the link is posted in QQ / WeChat). **Every absolute URL in these files must
use the main domain `https://classsoftwarehub.us.ci/`** — Bing rejects a sitemap that lists another
domain ("not contained in this site"); the two mirrors (132614.xyz / xfane.com) are folded into the
main domain by `canonical`. Vite copies `public/` verbatim into
`dist/`, so they reach GitHub Pages and the FTP mirror; the OpenList step uploads `index.html` only.
Keep this copy in step with the real site — search engines index the static `<title>`/`description`
and the `<noscript>` block, **not** the runtime i18n strings. Two limits worth repeating: the site
uses **hash routing**, so `/#/download/<id>` is not a distinct URL to a crawler (only the home page
is listable, which is why `sitemap.xml` has a single entry), and the app is fully client-rendered,
so the `<noscript>` body is all a non-JS crawler sees. Swapping the cover is just PNG-in,
PNG-out at the same path.

**"The site did not update after deploy"**: first check whether `deploy.yml` actually ran. A push made
with `GITHUB_TOKEN` never triggers it, so post-review deploys rely on the explicit
`gh workflow run deploy.yml` dispatch.

**"Some regions cannot open the site"**: this is a mainland-reachability problem. Check for
blocked domains such as `.workers.dev`. The main site is served from SpeedOnline Hong Kong, while the
submission path goes through Cloudflare.

---

## Appendix: Sandbox Notes (optional, sandbox-only)

Inside the WorkBuddy sandbox: `ls` / `head` / `rm` / `cat` may be missing (fall back to the managed
Python interpreter); git over HTTPS is blocked by a certificate-revocation check (push via
`api.github.com` + the Contents / Git Data API instead); **`git rebase` is forbidden**. The full set of
workarounds lives in `.workbuddy/memory/MEMORY.md` (that directory is not committed).
