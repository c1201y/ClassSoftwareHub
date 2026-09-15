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
| Data | `软件数据/apps/*.json` (one file per app, 57 today) + `软件数据/categories.json` (4 categories) |
| Strings | Chinese = `文字设置.ts` at repo root; English = `src/gallery/Strings/en-US/Resources.ts` |
| Live site | https://classsoftwarehub.132614.xyz (see `CNAME`) / mirror: classsoftwarehub.xfane.com |
| Output | `npm run build` → `dist/` (multi-file); `SINGLEFILE=1` → one HTML file (what CI ships) |

### Commands

```bash
npm install           # first time only
npm run dev           # dev server at http://localhost:5173
npm run type-check    # vue-tsc --build (run it after touching any .ts/.vue)
npm run build         # multi-file bundle → dist/
npm run build:single  # single-file bundle → dist/index.html (~1.9 MB, opens offline)
npm run check         # type-check + build
```

---

## 1. Directory Map

```
文字设置.ts                    ★ All Chinese UI strings (the only file to touch for copy)
鸣谢文本.ts                       Credits list on the Settings page (independent of 文字设置.ts)
软件数据/
  ├─ categories.json             The 4 categories: system / schedule / teaching / other
  ├─ README-维护手册.md          ★ Read this before editing data
  └─ apps/<id>.json              One file per app; files starting with `_` are not loaded
src/
  ├─ main.ts                     Mount entry
  ├─ gallery/                  ★ This site's application code
  │   ├─ App.vue                 Shell: nav pane / theme / holiday skin / welcome dialog / data-error bar
  │   ├─ router.ts               The 7 routes (table below)
  │   ├─ pages/                  HomePage / DownloadDetailPage / SettingsPage / SubmitPage / AiNavPage
  │   ├─ tools/                  ★ Built-in tools: index.ts registry + ToolShell.vue + one .vue per tool
  │   │                           (adding a tool = one registry entry; its route is generated from it)
  │   ├─ aiSiteIcons.ts          Site icons for the AI-nav page (inlined base64, no third-party icon service)
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
stats-worker/
  ├─ worker.js                   Cloudflare Worker: visit stats + GitHub API proxy (600+ lines)
  └─ wrangler.toml               Deploy config (KV binding: STATS)
submissions/                     Visitor-submitted app drafts (submission-flow entry; don't hand-edit)
.github/workflows/               The 3 workflows (see "CI Notes")
```

Routes (hash-based):

| Path | Page |
|---|---|
| `#/home` | Home: app card grid (`#/` and unknown paths redirect here) |
| `#/download/:id` | App detail page; `:id` = the `id` field in the data |
| `#/settings` | Settings (appearance / about / visit stats) |
| `#/submit` | Submit a new app |
| `#/tools` | Built-in tools (card list, 10 client-side utilities) |
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

---

## 3. Data Contract (`软件数据/apps/*.json`)

Fields and meanings (full reference: `软件数据/README-维护手册.md` and `_模板.json`):

| Field | Meaning |
|---|---|
| `id` | **Unique** ASCII identifier: lowercase letters, digits, hyphens only. URL = `#/download/<id>` |
| `name` | App name |
| `icon` | Icon image URL (square, 256×256 recommended); empty shows a placeholder |
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
- `deploy.yml` builds **once** in the `build` job and passes the artifact to the three upload jobs
  (previously each uploaded job rebuilt, burning runner minutes). The single-file output is just
  `dist/index.html`.
- All three workflows carry Chinese comments explaining *why* they are written this way —
  **read those comments before changing anything.**

---

## 7. Versioning & Releases (new rules as of 2026-09-15)

- Public version: `X.Y.Z` + a **codename suffix, which is kept** (e.g. `- Autumn`).
  X = major (architecture / UI overhaul); Y = feature update; Z = small fix.
- Internal version: `AAAABBCCPRDD` (year / month / day / file revision), e.g. `20260915PR01`.
- Update all of these together — current value is `v2.3.0 - September 18 Incident (20260916PR03)`:
  - `文字设置.ts` → `app.version`, `home.subtitle`, `welcome.intro` (**3 places**)
  - `src/gallery/Strings/en-US/Resources.ts` → `app.version`
  - `package.json` → `version` (bare `2.3.0`, no codename / internal number); also bump the two `"version"` fields
  at the top of `package-lock.json` (npm normally syncs these)
- Release tags keep the old habit: `v2.3.0-September18Incident` (history: `v2.1.0-Autumn`, `v2.2.0-Autumn`).
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

**Changing site copy**: only `文字设置.ts` (plus the English file) — never touch the keys.

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
