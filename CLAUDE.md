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
anything under `engine/`, `content/`, `characters/`, or `llm/`.

The UI has a pixel-reference prototype: [`docs/design/`](./docs/design/) — read its README first,
then `riddlon-app-mockup.dc.html` before working on anything under `ui/` or a route/component.

The repo started from a **client-only Progressive Web App template** (SvelteKit + Svelte 5 +
Tailwind 4): the toolchain, PWA plumbing (installable manifest, offline service worker, opt-in
update flow), and CI were already wired together, so the project started from a green build. There
is **no backend** — adapter-static emits a prerendered shell that hydrates and then runs entirely
in the browser. As of now the app itself is still that template's starter page; the sections below
document the inherited base, and the GitHub issue backlog tracks building the actual app on top of
it (story engine, chat UI, content loader, character library, local-LLM module).

Planned module layout inside `src/lib/` (per the concept doc's "App 2" breakdown — none of these
exist yet, they land via the issue backlog):

| Module        | Responsibility                                                                  |
| ------------- | ------------------------------------------------------------------------------- |
| `ui/`         | Chat interface, contact list, menus, settings                                   |
| `engine/`     | Story state machine: scenes, flags, clues, triggers, progress                   |
| `content/`    | Loader/importer/installer/registry for installed story packages                 |
| `characters/` | Local, story-independent character library                                      |
| `llm/`        | Model selection, session management, prompting, streaming, swappable backends   |
| `storage/`    | Savegames, local story library, caches (IndexedDB + Cache/Blob storage)         |
| `pwa/`        | Service worker, offline behavior, asset precaching (already present, see below) |

## Commands

| Task                | Command                                                    |
| ------------------- | ---------------------------------------------------------- |
| Dev server          | `npm run dev`                                              |
| Production build    | `npm run build` → static site in `build/` (adapter-static) |
| Preview build       | `npm run preview`                                          |
| Type-check          | `npm run check` (runs `svelte-kit sync` + `svelte-check`)  |
| Unit tests (once)   | `npm test`                                                 |
| Unit tests (watch)  | `npm run test:unit`                                        |
| Single test file    | `npx vitest run src/lib/utils/greeting.spec.ts`            |
| Single test by name | `npx vitest run -t "greets a given name"`                  |
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

3. **Example pure logic** — `src/lib/utils/greeting.{ts,spec.ts}`.
   A trivial pure helper + its Vitest spec, showing the Node-testable pattern: pure, framework-free
   logic lives in plain `.ts` files (matched by the `server` test project), while anything touching
   the DOM/browser APIs stays in `.svelte.ts` / components. Delete both once you have real code.

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
