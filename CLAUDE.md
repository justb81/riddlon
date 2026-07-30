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

The UI has a pixel-reference prototype: [`docs/design/`](./docs/design/) — read its README first,
then `riddlon-app-mockup.dc.html` before working on anything under `ui/` or a route/component.

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

| Module        | Responsibility                                                                | Status                                                                                                                |
| ------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `ui/`         | Chat interface, contact list, menus, settings                                 | Implemented — see "Chat UI" below                                                                                     |
| `engine/`     | Story state machine: scenes, flags, clues, triggers, progress                 | Implemented (`src/lib/engine/`) — `ui/` still runs on the `$lib/state/game.svelte.ts` mock until #14–#17 swap it over |
| `content/`    | Loader/importer/installer/registry for installed story packages               | Mocked in `$lib/story/library.ts`                                                                                     |
| `characters/` | Local, story-independent character library                                    | Not started                                                                                                           |
| `llm/`        | Model selection, session management, prompting, streaming, swappable backends | Implemented — see "Local LLM" below                                                                                   |
| `storage/`    | Savegames, local story library, caches (IndexedDB + Cache/Blob storage)       | Not started — all state above is in-memory only, lost on reload                                                       |
| `pwa/`        | Service worker, offline behavior, asset precaching                            | Implemented (template base)                                                                                           |

## Local LLM

`src/lib/llm/` runs inference in the browser. It does **not** define its own backend vocabulary: the
interface _is_ the [W3C/Chrome Prompt API](https://webmachinelearning.github.io/prompt-api/)
(`LanguageModel.availability()` / `create()` / `promptStreaming()`), and browsers without a built-in
one get it from Google's `prompt-api-polyfill` driving its **WebLLM** backend over WebGPU.
**Native first, polyfill fallback** — a built-in model costs no download, so it wins when present.

- **`catalog.ts`** — the only place a Riddlon model id maps to an MLC model id. Two entries, chosen
  for German dialogue: `llama-3.2-3b` (default) and `llama-3.1-8b`. `approxDownloadBytes` (what the
  player waits for) and `vramRequiredMB` (peak GPU memory, the capability check) are separate figures
  and must never be conflated — the design mockup's "1,8 GB / 4,6 GB" were download sizes.
- **`adapter.ts`** — `LlmAdapter` / `LlmSession`, what `engine/` and `ui/` code against. Injects its
  provider, so `adapter.spec.ts` exercises the real logic against a fake in Node with no GPU.
- **`provider.ts`** — the _only_ file touching `globalThis.LanguageModel`, `window.WEBLLM_CONFIG` or
  `import('prompt-api-polyfill')`. The native probe must run before the polyfill import (the polyfill
  installs itself on the global as an import side effect), and `WEBLLM_CONFIG` must be set before it
  (with no config the polyfill silently falls back to Transformers.js).
- **`llm.svelte.ts`** — the `llm` singleton the UI reads: status, real download progress, which
  backend won, which models are cached. `profile.model` holds the _choice_; `llm.activeModelId` holds
  what's _loaded_ — they differ whenever a selected model hasn't been downloaded.
- **`stubs/unsupported-backend.ts`** + `resolve.alias` in `vite.config.ts` — the polyfill can also
  reach Firebase/Gemini/OpenAI/Transformers.js. Those four SDKs are aliased to a throwing stub, so
  "no cloud calls" (concept §2/§8) is enforced by the build, not by convention.

Things that look wrong but aren't:

- The `boot.step.loadingModel` → `boot.step.preparingDevice` switch is a **threshold heuristic**
  (fraction ≥ 0.85). The polyfill collapses download and shader-compile into one 0..1 fraction and
  doesn't forward WebLLM's progress text, so there is no real phase boundary to read.
- Under the polyfill **all characters share one backend session** (`personaMode: 'inline'`), with
  persona and history rendered into each prompt. A second `create()` would rebuild the whole
  MLCEngine, so per-character sessions would mean a multi-GB reload on every chat switch. The native
  provider does get a real session each.
- Inference runs on the **main thread** — the polyfill's WebLLM backend has no worker variant. Keep
  typing/spinner animations CSS-only so they survive the decode loop.
- `isModelCached()` asks web-llm's `hasModelInCache` _and_ keeps a localStorage marker. The
  polyfill's `availability()` always reports `'available'`, so it can't answer this; each fallback is
  wrong in a different way, and together the worst case is one unnecessary progress bar.
- Automated tests cannot run real inference — CI and the dev sandbox have no GPU. `npm test` covers
  the adapter against a fake; a real conversation turn is verified by hand via the dev-only
  `/dev/llm` harness route (delete it once #15 streams replies for real).

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
- **`AppFrame` + `ChatList`** — the responsive shell (see "Responsive layout" below). Every screen
  except the splash renders its content inside `<AppFrame>`.
- **Pure logic lives in plain `.ts` files** next to their `.svelte.ts`/route consumers, so it's
  Node-testable: `$lib/story/detect-evidence.ts`, `$lib/story/boot-steps.ts`,
  `$lib/state/profile.ts`, `$lib/i18n/format.ts`.

## Responsive layout

The design reference is a phone mockup, but the app is a PWA that also runs in a desktop browser
window. Rather than letting the phone layout stretch, `$lib/components/chat/AppFrame.svelte` wraps
every screen (splash excepted) and switches between two shapes **in CSS only** — no media-query
rune, no resize listener, so there's no layout flash on load:

- **below `lg` (1024px)** — pass-through. The route fills the viewport exactly as before; the
  mobile screens are byte-for-byte the same layout they were.
- **from `lg` up** — the two-pane desktop layout of WhatsApp/Telegram Web: `ChatList` docks as a
  persistent left sidebar (336 → 380 → 420px) next to whichever route is open, and marks the open
  thread as active. `/chats` becomes "sidebar + placeholder pane", since the list moved.
- **from `xl` up** — the whole frame caps at `max-w-frame` (1600px) and centres itself on
  `bg-surface-sunken` with a border, radius and shadow, so an ultrawide monitor gets an app window
  instead of a 2560px-wide chat.

`ChatList` is the extracted `/chats` body, mounted exactly once — it moves between "the whole
screen" and "the sidebar" purely via the aside/main visibility classes in `AppFrame`.

Two width tokens in `layout.css` cap content _inside_ the frame so text never runs its full width:
`max-w-chat` (60rem, message column + composer) and `max-w-pane` (46rem, the reading columns —
settings form, story overview, library). Both are plain `@theme` container values, so
`max-w-chat`/`max-w-pane` work as ordinary Tailwind utilities.

Gotchas:

- **Window Controls Overlay can't use `AppHeader` in the two-pane layout** — there are two headers
  side by side then, and only one titlebar rect. From `lg` up the `.app-header[data-wco]` fixed
  positioning is switched off and `AppFrame` draws its own `.app-frame-titlebar` drag strip above
  both panes instead (see `layout.css`). Below `lg` the original single-header behaviour stands.
- **`AppHeader`'s back chevron is hidden on desktop** (`backOnDesktop={false}`) on the conversation
  screens, where the docked list already is the way back. `/story` and `/settings` keep it — the
  sidebar has no entry for them.

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
