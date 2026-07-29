# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Riddlon** — an interactive chat-story platform. Players chat with characters; a plot unfolds
through the conversation while the app looks and feels like an ordinary messenger. This repository
is the **Player PWA** (the "App 2" from the concept doc): the end-user app that loads installed
story packages and runs them, including local LLM inference, entirely client-side. The companion
Authoring Studio (for creating/exporting story packages) is a separate, not-yet-built app.

Full product concept — vision, package format, story/character data model, the reference story
used to validate it — lives in [`docs/concept.md`](./docs/concept.md). Read it before working on
turning any of the mock `$lib/story/*` content into the real `engine/`/`content/`/`llm/` modules
described there.

The repo started from a **client-only Progressive Web App template** (SvelteKit + Svelte 5 +
Tailwind 4): the toolchain, PWA plumbing (installable manifest, offline service worker, opt-in
update flow), and CI were already wired together. There is **no backend** — adapter-static emits a
prerendered shell that hydrates and then runs entirely in the browser.

On top of that template, the UI for the seven core screens is implemented (splash/boot, chat
overview, solo + group chat, the "Riddlon" system/library chat, story overview, profile/settings),
driven by scripted mock data for the reference story "Lucys Portmonnaie" — see "Chat UI" below.
**Not yet real**: the story engine (scenes/flags are hardcoded beats, not a state graph), story
package import (the ZIP/URL buttons in `/chat/riddlon` are decorative), local LLM inference (model
list is static; nothing actually runs a model), and the character library. Those land per the
concept doc's "App 2" module breakdown as the issue backlog works through them:

| Module        | Responsibility                                                                | Status                                                                   |
| ------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `ui/`         | Chat interface, contact list, menus, settings                                 | Implemented — see "Chat UI" below                                        |
| `engine/`     | Story state machine: scenes, flags, clues, triggers, progress                 | Mocked in `$lib/state/game.svelte.ts`                                    |
| `content/`    | Loader/importer/installer/registry for installed story packages               | Mocked in `$lib/story/library.ts`                                        |
| `characters/` | Local, story-independent character library                                    | Not started                                                              |
| `llm/`        | Model selection, session management, prompting, streaming, swappable backends | Not started (`$lib/state/profile.ts` lists model options as static data) |
| `storage/`    | Savegames, local story library, caches (IndexedDB + Cache/Blob storage)       | Not started — all state above is in-memory only, lost on reload          |
| `pwa/`        | Service worker, offline behavior, asset precaching                            | Implemented (template base)                                              |

## Chat UI

Seven screens, each its own route so back/forward and reload work like a normal web app (the
original design used a single fake "phone frame" with in-memory screen switching — see
`chats/chat1.md` in the original design handoff if you need the full back-and-forth that produced
this design):

| Route            | Screen                                                                   |
| ---------------- | ------------------------------------------------------------------------ |
| `/`              | Splash + boot sequence, then auto-navigates to `/chats`                  |
| `/chats`         | Chat overview / thread list                                              |
| `/chat/[thread]` | Solo (`lucy`) or group (`group`) conversation — shared shell             |
| `/chat/riddlon`  | The "Riddlon" system chat: installed-story library + import (decorative) |
| `/story`         | Storyübersicht — milestone timeline + achievements for the active story  |
| `/settings`      | Profile & settings (nickname, pronouns, disguise mode, model, notify)    |

Notes on things that look like bugs but aren't:

- Tapping the **Sabine** or **Max** thread in `/chats`, or any catalog entry in `/chat/riddlon`
  other than "Lucys Portmonnaie", opens the same `lucy` thread / `/story` screen — there's only one
  reference story with real content right now (see `docs/concept.md` §7). Search for `Only "Lucys
Portmonnaie"` to find the call sites.
- The **"Fallakte ansehen"** button on the case-solved celebration literally says that (not
  "Storyübersicht") — that's the original design's wording; the screen it renamed to
  "Storyübersicht" is `/story`.

Building blocks:

- **`$lib/state/game.svelte.ts`** — the `game` singleton: message threads, typing indicators,
  contradiction-disclosure state, milestones, the achievement toast, and the case-solved
  celebration overlay. A scripted timer sequence stands in for a real story engine — see
  `#lucyBeat`/`#groupBeat`. Survives navigating between screens (like `toast.svelte.ts`).
- **`$lib/state/profile.svelte.ts`** — the `profile` singleton: nickname, pronouns, disguise mode
  (`pure` / `subtle` / `game` — controls how much game-y chrome shows across `/chats` and
  `/chat/[thread]`), local model choice, notification toggle. In-memory only; no persistence.
- **`$lib/story/*`** — mock "installed content package" data (seed messages, reply beats,
  milestones, achievements, the library catalog). Deliberately **not** routed through i18n — a real
  story package ships its own localized content, separate from the app's own UI chrome.
- **`$lib/components/chat/*`** — shared screen chrome: `AppHeader` (60px) + `InfoBand` (46px) are
  used on every screen so header height is identical everywhere (a specific piece of design
  feedback — see chat1.md), `MessageBubble`, `Composer`, `Avatar`, etc.
- **Pure logic lives in plain `.ts` files** next to their `.svelte.ts`/route consumers, so it's
  Node-testable: `$lib/story/detect-evidence.ts`, `$lib/story/boot-steps.ts`,
  `$lib/state/profile.ts`, `$lib/i18n/format.ts`.

## i18n

`$lib/i18n/` — German-only today, but every UI-chrome string goes through `t('some.key', vars)`
(`$lib/i18n/i18n.svelte.ts`) against `$lib/i18n/de.json`, so adding a language is "add
`en.json`, add one line to `dictionaries`" rather than a rewrite. `vars` does `{name}`-style
interpolation (`$lib/i18n/format.ts`). Story content (character dialogue, clue text, achievement
titles) is **not** in the dictionary — see "Chat UI" above.

## Commands

| Task                | Command                                                    |
| ------------------- | ---------------------------------------------------------- |
| Dev server          | `npm run dev`                                              |
| Production build    | `npm run build` → static site in `build/` (adapter-static) |
| Preview build       | `npm run preview`                                          |
| Type-check          | `npm run check` (runs `svelte-kit sync` + `svelte-check`)  |
| Unit tests (once)   | `npm test`                                                 |
| Unit tests (watch)  | `npm run test:unit`                                        |
| Single test file    | `npx vitest run src/lib/story/detect-evidence.spec.ts`     |
| Single test by name | `npx vitest run -t "mentionsEvidence"`                     |
| Lint                | `npm run lint` (prettier `--check` + eslint)               |
| Format              | `npm run format`                                           |

Tests run under Vitest's `server` (Node) project, which only matches `src/**/*.{test,spec}.{js,ts}`
(not `*.svelte.{test,spec}.*`). `requireAssertions` is enabled — every test must make at least one
assertion.

## Architecture

The template is deliberately thin. Three areas:

1. **App shell** — `src/app.html`, `src/routes/+layout.svelte`, `src/routes/+layout.ts`,
   `src/routes/+page.svelte`, `src/routes/layout.css`.
   `+layout.ts` sets `ssr = false` + `prerender = true` (client-only static site). `+layout.svelte`
   registers the service worker in production (and sheds any stale worker in dev), renders the
   update banner, and mounts the global `<Toast />`. `+page.svelte` is a placeholder starter page —
   replace it. `layout.css` holds the Tailwind import plus **semantic design tokens** (color / type /
   radius aliases onto Tailwind's palette, e.g. `bg-accent-strong`, `text-danger`) — retune the
   palette there for a new app.

2. **PWA infrastructure** — `src/service-worker.ts` and `src/lib/state/*.svelte.ts`.
   - `service-worker.ts` — cache-first precache of the app shell (`build` + `files` from
     `$service-worker`) for offline use. A newly installed worker deliberately sits in the "waiting"
     state instead of calling `skipWaiting()` itself, so the open page keeps running the version it
     loaded until the user opts in.
   - `state/update.svelte.ts` — `updateStatus` singleton: detects a waiting worker and flips
     `available`, driving the reload banner in `+layout.svelte`; `reload()` posts `SKIP_WAITING`.
   - `state/toast.svelte.ts` — `toast` singleton: transient success/error/info notifications with
     auto-dismiss, `persistent`, and `dedupeKey` de-duplication. Rendered by
     `src/lib/components/ui/Toast.svelte`.
   - `state/windowChrome.svelte.ts` — `windowChrome` singleton: live Window Controls Overlay state
     (installed Chromium-desktop only) for drawing the app header into the OS titlebar; paired with
     the `.app-header[data-wco='true']` block in `layout.css`. Inert everywhere else.

3. **Pure logic / Node-testable pattern** — e.g. `src/lib/story/detect-evidence.{ts,spec.ts}`,
   `src/lib/story/boot-steps.{ts,spec.ts}`, `src/lib/i18n/format.{ts,spec.ts}`. Framework-free logic
   (no runes, no browser APIs) lives in plain `.ts` files matched by the `server` test project;
   anything touching the DOM/browser APIs or holding reactive state stays in `.svelte.ts` files or
   components instead.

### State (Svelte 5 runes singletons)

App-wide state lives in `src/lib/state/*.svelte.ts` as plain classes exported as singletons, using
`$state` runes. Anything touching browser APIs is guarded so it stays inert during SSR/prerender and
in non-supporting environments (`browser` from `$app/environment`, plus feature detection).

## PWA / rendering

- **Client-only.** `+layout.ts` sets `ssr = false` + `prerender = true`; adapter-static emits a
  prerendered shell that hydrates and runs entirely in the browser.
- **Offline.** `service-worker.ts` is auto-registered by SvelteKit in production builds (manual
  registration is off — see `vite.config.ts`); it precaches the shell and static assets cache-first.
  The manifest link and `theme-color` are in `src/app.html`; assets are `static/manifest.webmanifest`
  and `static/pwa-icon*`.
- **Installable.** `static/manifest.webmanifest` declares name/icons/display; the icon is the
  Riddlon speech-bubble mark (`static/pwa-icon*`, sourced from `static/riddlon-icon-final.svg`).

## CI / release

`.github/` is preconfigured: **CI** (`ci.yml`) runs `lint` / `check` / `test` / `build` on every PR;
**Dependabot** (`dependabot.yml`) opens weekly grouped dependency PRs with a 7-day cooldown;
**release-please** (`release-please.yml` + `release-please-config.json` + `.release-please-manifest.json`)
raises the version/changelog PR from Conventional Commits; **deploy** (`deploy.yml`) builds with
`BASE_PATH` set to the Pages subpath and publishes to GitHub Pages on each release. The release-please
workflow needs a `RELEASE_TOKEN` repository secret (a PAT) so a created release can trigger the deploy.

## Conventions & gotchas

- **There is no `svelte.config.js`.** SvelteKit config (the static adapter and the forced-runes
  `compilerOptions`) lives inside the `sveltekit()` plugin call in `vite.config.ts`. Change SvelteKit
  options there.
- **Runes are forced on** for all app code (everything outside `node_modules`). Use `$state` /
  `$derived` / `$props`; stores are plain classes in `.svelte.ts` files exported as singletons.
- **Relative imports use explicit `.js` extensions** (tsconfig `rewriteRelativeImportExtensions`).
  Use the `$lib` alias for `src/lib`.
- **Nothing touching the DOM may run at module top-level or during SSR/prerender.** Guard with
  `browser` from `$app/environment` and feature-detect optional browser APIs.
