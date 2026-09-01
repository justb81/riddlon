# 2. Architecture Constraints

## 2.1 Technical Constraints

| #   | Constraint                                                                                                                                                  | Consequence                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| TC1 | **No backend.** The app is a static, client-only site (`adapter-static`, `ssr = false`, `prerender = true`).                                                | No server-side validation, no shared state, no server-issued secrets. Everything runs in the browser.                   |
| TC2 | **Static hosting on GitHub Pages** under a repository subpath.                                                                                              | The build honours `BASE_PATH`; routes must not assume an origin root. No SPA fallback is configured.                    |
| TC3 | **AI inference runs in the browser**, on the main thread, over WebGPU or the browser's built-in Prompt API.                                                 | Multi-second decode loops block JavaScript; animations must be CSS-only. Model weights are multi-GB.                    |
| TC4 | **No cloud SDKs.** Firebase, Gemini, OpenAI and Transformers.js are aliased to a throwing stub in `vite.config.ts`.                                         | An accidental cloud dependency fails the build. The one deliberate cloud path (Gemini BYOK) uses plain `fetch`.         |
| TC5 | **Browser storage only** — IndexedDB (metadata, saves, characters, profile), Cache Storage (binary assets, model weights), `localStorage` (small settings). | Quota, private-browsing and eviction are normal conditions, not error cases.                                            |
| TC6 | **Svelte 5 with runes forced on** for all app code; **TypeScript** throughout.                                                                              | State lives in `$state`-based singleton classes, not stores. Legacy Svelte idioms are unavailable.                      |
| TC7 | **Node 22+ for development, Node 26 in CI.**                                                                                                                | Toolchain and scripts may use current Node APIs.                                                                        |
| TC8 | **Tests run in Node**, with no GPU, no IndexedDB and no Cache Storage by default.                                                                           | Browser-only code paths are covered by `fake-indexeddb` where possible and by manual `/dev/*` harness routes otherwise. |
| TC9 | **UI language is German.** Only German chrome strings exist today.                                                                                          | Every chrome string goes through `t()` so a second language is additive; story content is never in the dictionary.      |

## 2.2 Organisational Constraints

| #   | Constraint                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- |
| OC1 | **Open source.** The package format is publicly documented and must remain implementable by third parties.                         |
| OC2 | **Conventional Commits** drive release-please, which raises the version/changelog PR for the app.                                  |
| OC3 | **Story packages version and release independently of the app** (`story-<slug>-v<version>` tags). A released version is immutable. |
| OC4 | **CI gates every pull request** with `lint`, `check`, `test` and `build`; story packages are validated in the same run.            |
| OC5 | **Architecture documentation is arc42 only** — see [`README.md`](./README.md) in this directory for the maintenance rules.         |

## 2.3 Conventions

These are enforced by tooling or by review and are easy to violate accidentally:

- **There is no `svelte.config.js`.** SvelteKit configuration (static adapter, forced-runes
  `compilerOptions`, `paths.base`, service-worker registration off) lives inside the `sveltekit()`
  call in `vite.config.ts`.
- **Relative imports carry explicit `.js` extensions** (`rewriteRelativeImportExtensions`); use the
  `$lib` alias for `src/lib`.
- **Nothing touching the DOM may run at module top level or during prerender.** Guard with `browser`
  from `$app/environment` and feature-detect optional browser APIs.
- **Pure logic lives in plain `.ts` files** next to their `.svelte.ts` consumers so the Node test
  project can reach it. Vitest's `server` project matches `src/**/*.{test,spec}.{js,ts}` and
  excludes `*.svelte.{test,spec}.*`; `requireAssertions` is on.
- **Module boundaries are asserted by tests**, not just by convention: `engine/` may not depend on
  `llm/` (`no-llm-dependency.spec.ts`), and nothing outside `src/lib/llm/` may import
  `@mlc-ai/web-llm` (`no-backend-leakage.spec.ts`).
- **The app ships no story content.** No thread, message, contact, clue or chapter may be authored
  inside `src/lib/`; content only ever enters through the importer. Test fixtures under
  `__fixtures__/` are the sole exception.
