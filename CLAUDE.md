# CLAUDE.md

Guidance for [Claude Code](https://claude.com/claude-code) when working in this repository.

## Project

**Riddlon** — an interactive chat-story platform. Players chat with characters; a plot unfolds
through the conversation while the app looks and feels like an ordinary messenger. This repository
is the **Player PWA**: a client-only SvelteKit + Svelte 5 + Tailwind 4 app with no backend, running
story packages — including local LLM inference — entirely in the browser.

**The architecture documentation is [`docs/arc42/`](./docs/arc42/).** Read the relevant chapter
before changing anything non-trivial; do not re-derive the design from the code.

| Before working on…                  | Read                                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| anything at all                     | [§5 Building Block View](./docs/arc42/05-building-block-view.md)                                                                                                                 |
| `engine/`, `content/`, `stories/`   | [§8.1 Content Package Format](./docs/arc42/08-crosscutting-concepts.md#81-content-package-format), [§8.3 Story Engine](./docs/arc42/08-crosscutting-concepts.md#83-story-engine) |
| `llm/`                              | [§8.4 Local LLM Inference](./docs/arc42/08-crosscutting-concepts.md#84-local-llm-inference)                                                                                      |
| `ui/`, a route, a component         | [§8.7 UI, Layout and Design System](./docs/arc42/08-crosscutting-concepts.md#87-ui-layout-and-design-system), then `docs/design/riddlon-app-mockup.dc.html`                      |
| `state/`, `story/`                  | [§8.11 State Management](./docs/arc42/08-crosscutting-concepts.md#811-state-management)                                                                                          |
| a build, CI or release change       | [§7 Deployment View](./docs/arc42/07-deployment-view.md)                                                                                                                         |
| understanding _why_ something is so | [§9 Architecture Decisions](./docs/arc42/09-architecture-decisions.md), [§11 Risks and Technical Debt](./docs/arc42/11-risks-and-technical-debt.md)                              |

## Documentation policy — arc42 only

1. **All documentation goes into `docs/arc42/`, in English, in the matching chapter.** Never create a
   new free-standing document, a new `docs/*.md`, a design note, a status file or a summary
   markdown. If a fact does not fit one of the twelve chapters, it does not belong in the repository.
   The two exceptions are this file (agent guidance) and the top-level `README.md` (a short entry
   point that links into arc42).
2. **A change to behaviour or structure updates its chapter in the same commit.** A new trade-off
   gets an ADR entry in chapter 9; an accepted gap gets an entry in chapter 11.
3. **One concept, one place.** Link to an existing section rather than restating it. Duplicated prose
   is how this repository's documentation drifted before.
4. **Delete what is no longer true.** Documentation that describes an intention rather than the code
   belongs in chapter 11, clearly marked as open — nowhere else.
5. **Code comments reference sections** as `docs/arc42 §8.1.4`; the leading number names the chapter
   file. Renumbering a section means updating the references in the same commit
   (`grep -rn "docs/arc42" src scripts stories .claude`).
6. **Per-package `stories/<slug>/README.md` files are content notes, not architecture** — cast,
   beat-to-scene mapping, flags. Format, tooling and release procedure live in arc42.
7. Chapter maintenance rules are restated in [`docs/arc42/README.md`](./docs/arc42/README.md).

## Where things live

| Path                  | Contents                                                                     |
| --------------------- | ---------------------------------------------------------------------------- |
| `src/routes/`         | The seven player screens plus dev-only `/dev/*` harness routes               |
| `src/lib/components/` | Shared chat chrome (`AppFrame`, `ChatList`, `AppHeader`, `MessageBubble`, …) |
| `src/lib/state/`      | Svelte 5 runes singletons — the only reactive layer the UI reads             |
| `src/lib/story/`      | Pure derivations from bundle + engine state into display shapes              |
| `src/lib/engine/`     | The deterministic story state machine                                        |
| `src/lib/content/`    | Package schemas, validator, loader, importers, installer                     |
| `src/lib/characters/` | Local, story-independent character library logic                             |
| `src/lib/llm/`        | Providers, adapter, persona and director prompting, capabilities             |
| `src/lib/storage/`    | IndexedDB stores and the Cache-Storage blob store                            |
| `src/lib/i18n/`       | `t()` and `de.json` — UI chrome only, never story content                    |
| `stories/<slug>/`     | Authored story packages, released on their own tags                          |
| `scripts/`            | Story validation, packing and playtest tooling                               |

## Commands

| Task                | Command                                              |
| ------------------- | ---------------------------------------------------- |
| Dev server          | `npm run dev`                                        |
| Production build    | `npm run build` → static site in `build/`            |
| Preview build       | `npm run preview`                                    |
| Type-check          | `npm run check`                                      |
| Unit tests (once)   | `npm test`                                           |
| Unit tests (watch)  | `npm run test:unit`                                  |
| Single test file    | `npx vitest run src/lib/story/story-display.spec.ts` |
| Single test by name | `npx vitest run -t "storyThreads"`                   |
| Lint / format       | `npm run lint` / `npm run format`                    |
| Validate stories    | `npm run stories:validate`                           |
| Pack stories        | `npm run stories:build` → `dist/stories/`            |
| Bundle for the app  | `npm run stories:bundle` → `static/stories/`         |
| Playtest a story    | `npm run story:playtest -- stories/<slug>`           |

Tests run under Vitest's `server` (Node) project, which matches `src/**/*.{test,spec}.{js,ts}` and
not `*.svelte.{test,spec}.*`. `requireAssertions` is on — every test must assert at least once.

## Conventions and gotchas

- **There is no `svelte.config.js`.** SvelteKit configuration lives inside the `sveltekit()` call in
  `vite.config.ts`.
- **Runes are forced on** for all app code. Use `$state` / `$derived` / `$props`; stores are plain
  classes in `.svelte.ts` files exported as singletons.
- **Relative imports use explicit `.js` extensions**; use the `$lib` alias for `src/lib`.
- **Nothing touching the DOM may run at module top level or during prerender.** Guard with `browser`
  from `$app/environment` and feature-detect optional browser APIs.
- **Pure logic goes in plain `.ts` files** next to their `.svelte.ts` consumers, so the Node test
  project can reach it. Keep the runes singletons thin.
- **The app ships no story content.** Nothing under `src/lib/` may contain an authored thread,
  message, contact, clue or chapter; content only enters through the importer. `__fixtures__/` is the
  sole exception — searching `src/lib/` for `Lucy` should find nothing else.
- **Module boundaries are asserted by tests**: `engine/` must not import `llm/`, and nothing outside
  `src/lib/llm/` may import `@mlc-ai/web-llm`.
- **`static/stories/` is generated and git-ignored.** Edit a story under `stories/` only.
- Inference runs on the **main thread** — keep typing and spinner animations CSS-only so they survive
  the decode loop.

## Manual browser testing from this sandbox

Vitest's `server` project runs in Node: no IndexedDB, no Cache Storage, no WebGPU. `fake-indexeddb`
covers IndexedDB in `*.integration.spec.ts` (`import 'fake-indexeddb/auto'` plus a
`vi.mock('$app/environment', () => ({ browser: true }))`), but there is **no** Node polyfill for
Cache Storage, so `blob-store.ts` and anything downstream only runs for real in a browser. That is
what the dev-only `/dev/*` routes are for — add a new one under `src/routes/dev/<name>/+page.svelte`
rather than trying to make a Node test cover what only a browser can.

- **Start/stop the dev server** — poll the port, don't `sleep`:

  ```bash
  npm run dev &
  timeout 30 bash -c 'until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done'
  # ...
  lsof -ti:5173 -sTCP:LISTEN | xargs -r kill
  ```

- **No `chromium-cli` here** — drive Playwright directly. It is installed globally, not as a project
  devDependency, and the pre-installed Chromium path is an executable symlink, not a directory
  (`/opt/pw-browsers/chromium/chrome-linux/chrome` does **not** exist):

  ```js
  import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
  const browser = await chromium.launch({
  	executablePath: '/opt/pw-browsers/chromium',
  	args: ['--no-sandbox']
  });
  ```

- **Building a test package ZIP** — `src/lib/content/__fixtures__/*.ts` are plain data objects behind
  the `$lib` alias, which a standalone Node script outside Vite cannot resolve.
  `__fixtures__/zip.ts`'s `zipPackageFiles()` turns such a files-map into real ZIP bytes using
  `fflate`. Either add a throwaway spec that calls it and writes the result with `node:fs`, or
  duplicate the JSON in a standalone script importing `zipSync` from
  `node_modules/fflate/esm/index.mjs` (the plain `fflate` subpath does not resolve outside a bundler).
- Always finish by checking the page's `'console'` and `'pageerror'` events — a route can render its
  shell while a promise inside it silently rejects.
