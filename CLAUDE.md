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
anything under `engine/`, `content/` or `llm/`.

The UI has a pixel-reference prototype: [`docs/design/`](./docs/design/) — read its README first,
then `riddlon-app-mockup.dc.html` before working on anything under `ui/` or a route/component.

The repo started from a **client-only Progressive Web App template** (SvelteKit + Svelte 5 +
Tailwind 4): the toolchain, PWA plumbing (installable manifest, offline service worker, opt-in
update flow), and CI were already wired together. There is **no backend** — adapter-static emits a
prerendered shell that hydrates and then runs entirely in the browser.

On top of that template, the UI for the seven core screens is implemented (splash/boot, chat
overview, solo + group chat, the "Riddlon" system/library chat, story overview, profile/settings)
— see "Chat UI" below.

**The app ships no story content of its own.** There is no built-in demo, no mock cast and no
authored dialogue anywhere under `src/lib/`: every thread, message, contact, clue and chapter is
derived from whatever package the player installed, and content only ever enters through the ZIP
or URL importer (docs/concept.md §4.1). An example package is bundled under `static/stories/` and
installed through that same URL importer — see "Story packages" below. Searching for `Lucy` in
`src/lib/` should find nothing but the content-module test fixtures.

| Module        | Responsibility                                                                | Status                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/`         | Chat interface, contact list, menus, settings                                 | Implemented — see "Chat UI" below                                                                                                             |
| `engine/`     | Story state machine: scenes, flags, clues, triggers, progress                 | Implemented (`src/lib/engine/`), driving the UI through `$lib/state/engine.svelte.ts`                                                         |
| `content/`    | Validator/loader/importer/installer for story packages                        | Implemented (`src/lib/content/`) — ZIP (`zip-import.ts`) + URL (`url-import.ts`), both wired to `/chat/riddlon`                               |
| `characters/` | Local, story-independent character library                                    | Implemented (`src/lib/characters/`, backed by `src/lib/storage/character-library.ts`)                                                         |
| `llm/`        | Model selection, session management, prompting, streaming, swappable backends | Implemented — see "Local LLM" below                                                                                                           |
| `storage/`    | Savegames, local story library, caches (IndexedDB + Cache/Blob storage)       | Implemented (`src/lib/storage/`) — IndexedDB via `idb` (`db.ts`), binary assets via Cache Storage (`blob-store.ts`), reset in `clear-data.ts` |
| `pwa/`        | Service worker, offline behavior, asset precaching                            | Implemented (template base)                                                                                                                   |

## Story packages (`stories/`)

Story content is **not** authored in the app — it lives under `stories/<slug>/` as the unzipped
package layout from `docs/concept.md` §5 and releases separately. Read
[`stories/README.md`](./stories/README.md) before touching any of it.

- `stories/lucys-portmonnaie/` is the concept §7 reference story (#19) — manifest, three character
  identities, a 10-node scene graph over all 15 walkthrough steps, clues/facts/secrets, placeholder
  SVG assets. Its own README maps each §7 step to a scene id and lists the flags the engine expects
  callers to set.
- `scripts/build-stories.mjs` (`npm run stories:validate` / `stories:build`) validates each package
  with the app's own `src/lib/content/validate-package.ts` — loaded through Vite's SSR module
  runner, which is why validating shipped content needs no separate TS runner or new dependency —
  and packs a reproducible zip into `dist/stories/`.
- **`npm run stories:bundle` (`--static`) writes the same zips plus `index.json` into
  `static/stories/`**, and `predev`/`prebuild` run it, so the directory is generated and
  gitignored — `stories/` stays the only place a story is edited. `/chat/riddlon` reads that
  `index.json` and installs an entry with `importPackageFromUrl()`: a bundled example takes the
  exact same path as a package the player fetches themselves, so there is no privileged install
  route into the registry. Being under `static/` at build time also puts the zip in the service
  worker's precache, which is what makes the first install work offline.
- `.github/workflows/stories.yml` publishes one GitHub release per package version, tagged
  `story-<slug>-v<version>` — each package releases independently, so editing one story never
  re-releases the others. **Bumping `version` in a `manifest.json` and merging to `main` is the
  entire release procedure.** `deploy.yml` skips `story-*` tags so a content release doesn't
  redeploy the site. A released version is immutable: the workflow diffs each built zip's
  checksum against the released one and fails with "bump the version" rather than letting an
  edit merge without publishing.

The shipped package is the engine's acceptance fixture, not a copy of it: `__fixtures__/lucys-portmonnaie-walkthrough.ts`
reads `stories/lucys-portmonnaie/` off disk (Node-only — specs only, never app code), so
`engine.spec.ts`'s §7 walkthrough plays through the exact content that gets released. Editing the
story means editing the JSON. `src/lib/content/story-packages.spec.ts` additionally validates every
package under `stories/` on a plain `npm test`.

## Local LLM

`src/lib/llm/` runs inference in the browser. It does **not** define its own backend vocabulary: the
interface _is_ the [W3C/Chrome Prompt API](https://webmachinelearning.github.io/prompt-api/)
(`LanguageModel.availability()` / `create()` / `promptStreaming()`). Three providers implement it,
tried in order — **native first, direct WebLLM second, Gemini BYOK last resort** — and `provider.ts`
is the only file that knows any of the three exists:

1. **Native** — the browser's own built-in Prompt API (Gemini Nano in Chrome), probed off
   `globalThis.LanguageModel`. Costs no download, so it wins whenever present.
2. **WebLLM** (`webllm-direct.ts`) — a direct `@mlc-ai/web-llm` engine over WebGPU, for browsers with
   no native model. There used to be a `prompt-api-polyfill` dependency driving this; issue #69
   replaced it with a hand-written direct engine (see below), and the polyfill package is gone
   entirely — not even a `package.json` dependency.
3. **Gemini** (`gemini-direct.ts`, issue #84) — a player-supplied, BYOK Gemini API key, tried only
   when the WebLLM catalog model can't run on this device (no WebGPU, or not enough VRAM) _and_ a key
   is stored in settings. Never preferred over a usable local model; a rescue path for devices that
   can play no other way, not an alternative players opt into for quality.

- **`catalog.ts`** — the only place a Riddlon model id maps to an MLC model id. One entry today,
  `llama-3.2-3b` (also `DEFAULT_MODEL_ID`), chosen for German dialogue. There used to be a
  `llama-3.2-1b` fallback tier for weaker devices; issue #85's live-browser testing found it, and
  every other tested sub-1GB-VRAM model, broke character or produced incoherent output, so a device
  that can't hold 3B now falls to the `unsupported` state (or the Gemini fallback above) rather than
  a smaller, unusable local tier. The player never picks a model directly (the settings screen's
  model list is a read-only status view, not a picker; see `model-status.ts`). Deliberately no larger
  tier either: Llama 3.2 tops out at 3B, and the older Llama 3.1 8B isn't worth doubling the download
  for the rare device that could hold it but has no native Prompt API. `vramRequiredMB` is copied from
  `@mlc-ai/web-llm`'s own `prebuiltAppConfig` model list (`catalog.spec.ts` asserts the copies stay in
  sync), not hand-guessed — `catalog.ts` itself still never imports `@mlc-ai/web-llm` directly, since
  that's a heavy dependency this module is reachable from far outside the WebLLM-only code path.
  `approxDownloadBytes` (what the player waits for) and `vramRequiredMB` (peak GPU memory, the
  capability check) are separate figures and must never be conflated — the design mockup's
  "1,8 GB / 4,6 GB" were download sizes.
- **`adapter.ts`** — `LlmAdapter` / `LlmSession`, what `engine/` and `ui/` code against. Injects its
  provider, so `adapter.spec.ts` exercises the real logic against a fake in Node with no GPU. Every
  logical session — one per character, plus the director — gets its own real backend handle on all
  three providers; `webllm-direct.ts`'s one persistent `MLCEngine` (reused across sessions, KV-cache
  reset on switch rather than a multi-gigabyte reload) is what makes that affordable for WebLLM too.
- **`provider.ts`** — the only file touching `globalThis.LanguageModel`. Its `resolveProvider(modelId,
capabilities?)` tries native, then WebLLM, then — only when `capabilities` says WebLLM can't run
  `modelId` and a Gemini key is stored (`gemini-key.ts`) — Gemini. `capabilities` is optional and
  supplied by `llm.svelte.ts` (which already probes WebGPU once at boot) purely so this module never
  has to re-probe WebGPU itself; callers that omit it (tests, `/dev/llm`'s force-WebLLM harness) just
  get the pre-#84 behaviour of an unsupported WebLLM model failing outright.
- **`gemini-direct.ts`** — `createGeminiLanguageModel(apiKey, modelId)`, a `LanguageModelLike` over
  the Gemini REST API via plain `fetch` (no SDK — same reasoning as the four stubbed cloud SDKs
  below). `create()`/`availability()` never touch the network, only `prompt()`/`promptStreaming()`
  do, so resolving this provider and the adapter's warm-up handle cost nothing. 401/403/429 responses
  map to the `invalid-api-key`/`quota-exceeded` `LlmErrorCode`s.
- **`gemini-key.ts`** — the BYOK key's own `localStorage` module (`riddlon:llm:gemini-key`), separate
  from `profile.svelte.ts` (deliberately in-memory only) because this has to survive a reload. Never
  leaves the device except inside the Gemini request itself.
- **`llm.svelte.ts`** — the `llm` singleton the UI reads: status, real download progress, which
  backend won, which models are cached. `profile.model` holds the _choice_; `llm.activeModelId` holds
  what's _loaded_ — they differ whenever a selected model hasn't been downloaded. `supported`/`canRun`
  count a device as usable once a Gemini key is stored, even with no WebGPU — otherwise `#load` would
  fail before ever reaching `provider.ts`'s own Gemini branch. `localUnusable` deliberately ignores
  any stored key (native and WebLLM both fail here) and is what gates whether the settings screen
  shows the Gemini key field at all, so the field doesn't vanish the moment a key makes the device
  `supported` again.
- **`stubs/unsupported-backend.ts`** + `resolve.alias` in `vite.config.ts` — an unrelated, pre-#84
  guard: Firebase/Gemini/OpenAI/Transformers.js are aliased to a throwing stub so nothing pulls in an
  actual cloud SDK by accident (concept §2/§8's "no cloud calls" enforced by the build). The Gemini
  BYOK path above is a separate, deliberate opt-in over plain `fetch`, not this stub's `Gemini`.
- **`persona.ts`** — pure prompt building for one character in one scene: identity/voice from the
  character file, role and knowledge from this story's cast binding, `goals` from the scene,
  `relationships` resolved to names (a solo scene has no `otherParticipants`, so this is the only
  thing that lets a character name someone who isn't in the room — a goal like
  `name-max-and-sabine-as-witnesses` is unreachable without it), and concept §5.5's canon rule
  (facts must not be contradicted; a secret stays back until its `revealCondition` holds — which is
  why revealable and withheld secrets are separate lists). `buildOpeningInstruction()` repeats the
  scene's **first** goal in the turn instruction: goals sit in the system prompt, but an unanchored
  "write the first message" reliably produces filler, so goal order is prompt order for openers.
  Also `pickResponder()`, the documented app-side choice of who answers in a group chat, since the
  package format has no turn-taking rules.
- **`director.ts`** — the `engine/` ↔ `llm/` interface concept §9 left open. After each reply a
  second, short model call judges whether the active scene's `exitConditions` are met and which
  `revealables` were claimed, and the verdict is applied through the engine. Packages ship no
  dialogue and no keyword triggers, so **this is the only thing that advances the graph.** Both
  halves are pure and spec'd; the parser filters every id against what that scene declared, so a
  hallucinated answer can only ever mean "nothing happens", never "some other flag got set".

Things that look wrong but aren't:

- **`createSession(key, config)` returns the existing session but adopts the new `config`.** A
  thread keeps one session per character for the whole story while the _scene_ driving their goals
  advances underneath it, so the persona has to be re-applied on every turn; the conversation
  history is kept, and `seedTurns` only ever applies to the first call. The instruction lives inside
  the backend handle on every provider, so that handle is destroyed and rebuilt from
  `historyForReplay()`. Skipping this is what made a character replay the goals of the scene they
  were first spoken to in, forever — and since only the director advances the graph, the story then
  stopped dead.
- The `boot.step.loadingModel` → `boot.step.preparingDevice` switch is a **threshold heuristic**
  (fraction ≥ 0.85). `webllm-direct.ts` collapses download and shader-compile into one 0..1 fraction
  and doesn't forward WebLLM's progress text, so there is no real phase boundary to read.
- Inference runs on the **main thread** — WebLLM has no worker variant here. Keep typing/spinner
  animations CSS-only so they survive the decode loop.
- A player turn costs **two** decode passes: the character reply, then the director verdict. The
  director session is created with `maxHistoryTurns: 0` and destroyed after each call — it must
  judge this exchange, not accumulate its own past verdicts.
- `isModelCached()` asks web-llm's `hasModelInCache` _and_ keeps a localStorage marker.
  `webllm-direct.ts`'s own `availability()` always reports `'available'` (it can't tell "not yet
  downloaded" from "downloading" without loading the engine), so it can't answer this itself; each
  fallback is wrong in a different way, and together the worst case is one unnecessary progress bar.
- Automated tests cannot run real inference — CI and the dev sandbox have no GPU. `npm test` covers
  the adapter against a fake; a real conversation turn is verified by hand via the dev-only
  `/dev/llm` and `/dev/story` harness routes — the latter also shows the last raw director answer
  next to what survived the allowlist, since a verdict that silently sets nothing is otherwise
  invisible (the story just stops advancing). `/dev/story`'s **director probe** runs that pass on its
  own: pick a scene, edit the transcript, and see the exact prompt, the raw answer and the parsed
  verdict without playing a chat turn — which is how you tell a model problem from a story problem,
  since the story's flag chain is already asserted in Node (`engine.spec.ts`'s §7 walkthrough sets
  `flag:lucy-identified`/`flag:witnesses-named` by hand and expects Max and Sabine to appear).

## Chat UI

Seven screens, each its own route so back/forward and reload work like a normal web app (the
original design used a single fake "phone frame" with in-memory screen switching — see
`chats/chat1.md` in the original design handoff if you need the full back-and-forth that produced
this design):

| Route                | Screen                                                                |
| -------------------- | --------------------------------------------------------------------- |
| `/`                  | Splash + boot sequence, then auto-navigates to `/chats`               |
| `/chats`             | Chat overview / thread list                                           |
| `/chat?thread=<key>` | Solo or group conversation — shared shell                             |
| `/chat/riddlon`      | The "Riddlon" system chat: installed-story library + ZIP/URL import   |
| `/story`             | Storyübersicht — chapter timeline, clues and achievements             |
| `/settings`          | Profile & settings (nickname, pronouns, disguise mode, model, notify) |

**The conversation route takes its thread as a query parameter, not a path segment.** Thread keys
are character/scene UUIDs from the installed package, and `adapter-static` (configured without a
fallback) can only prerender a fixed set of path segments — the old `/chat/[thread]` had an
`EntryGenerator` listing two hardcoded ids. One prerendered `/chat` keeps arbitrary keys working
offline without an SPA fallback or a service-worker navigation handler. A solo thread's key is the
**character** id, a group thread's is the **scene** id.

Notes on things that look like bugs but aren't:

- **A fresh device has an empty chat list.** Nothing is auto-installed; the Riddlon system chat is
  the only row until a package is imported. That is the concept's model (§4.1 knows ZIP and URL
  import and nothing else), and the bundled example under `static/stories/` is offered there.
- **A story can be installed and still show no contacts.** `/chats` lists only what the engine
  reports as visible, so a character whose cast binding is `hidden` until some flag appears exactly
  when the story unlocks them. In `stories/lucys-portmonnaie` that means Lucy only, until
  `flag:witnesses-named`.
- **Without a loaded model a thread is empty and says so.** Every message — including a scene's
  opening line — is generated, so the conversation screen shows an explicit note rather than going
  mysteriously quiet. Opening a thread never _starts_ a model download; that is the boot screen's
  decision.
- **The story overview lists achievements but never awards them.** `achievementSchema` is
  id/label/description only (#32), so a package can name an achievement but not say when it is
  earned. They are listed as open with a note; only reached `outcomes` are real engine state.
- **Chapter numbers are scene positions.** The format has no scene titles or chapter numbering, so
  the timeline reports authored order and the participants' names, rather than inventing structure.
- The **"Fallakte ansehen"** button on the case-solved celebration literally says that (not
  "Storyübersicht") — that's the original design's wording; the screen it renamed to
  "Storyübersicht" is `/story`.

Building blocks:

- **`$lib/state/engine.svelte.ts`** — the `storyRuntime` singleton: one live `StoryEngine` + save
  per installed package, and every reactive field the UI reads (progress, cast, scenes, threads,
  clue panels, achievements, outcomes). Which package is active is persisted by
  `$lib/state/active-package.ts` (`riddlon:active-package`) and restored on boot; `#doInit` walks a
  candidate list and activates the first package that yields a loadable bundle, so one bad record
  can never leave the runtime with no session while the library still lists a story. `onActivate()`
  is how the chat session hears about an activation that happens after init (an import into an
  empty library, or a `switchTo` from the library screen) — a direct call would be an import cycle.
  `bundle` is a `$state.raw` **field**, not a getter over the active session: a getter can never
  invalidate a `$derived` that reads it, and the failure is silent — a derived that first runs before
  activation short-circuits on `bundle == null`, registers no dependency, and stays empty forever
  (this is exactly what made `/dev/story`'s scene lookup find nothing in a package with ten scenes).
  `engine` is still a plain getter and therefore imperative-callers-only.
- **`$lib/state/story-session.svelte.ts`** — the `storySession` singleton: chat history per thread,
  typing state, streaming reply, the contradiction panel's open row, the case-solved overlay, and
  the send loop (persist → stream a reply → director pass → apply verdict). History loads **per
  save id** through a serialised queue, so two activations can't interleave into one thread.
  Survives navigating between screens (like `toast.svelte.ts`).
- **`$lib/state/profile.svelte.ts`** — the `profile` singleton: nickname, pronouns, disguise mode
  (`pure` / `subtle` / `game` — controls how much game-y chrome shows across `/chats` and `/chat`),
  local model choice, notification toggle. In-memory only; no persistence.
- **`$lib/story/*`** — no story content, only generic derivations and display types.
  `persona-input.ts` composes "this character, in this scene, of this package" into
  `buildPersonaPrompt`'s input — pure and spec'd against the package under `stories/` rather than a
  fixture, because anything it forgets to pass is knowledge the model can never have, and that
  failure is invisible at runtime (the story just stops advancing).
  `story-display.ts` is the pure heart of it: scene timeline, clue panels, achievements, reached
  outcomes, and `storyThreads()` — which folds several scenes with the same character into **one**
  solo chat (a messenger shows one conversation per person, and a story has many scenes with the
  same figure) while giving every unlocked group scene its own thread. `library.ts` holds the
  catalog/bundled-story shapes; `types.ts` the message shape.
- **`$lib/state/reset.ts`** — the two "frisch starten" actions behind `/settings`:
  `resetStoryProgress()` (savegames only) and `resetEverything()` (packages, characters, saves,
  profile, settings, package assets). Both end in a full page load, because the state singletons
  memoize their `init()`. Downloaded LLM weights survive on purpose — `appKeysToClear()` (pure,
  spec'd) keeps the `riddlon:llm:*` markers so no multi-GB re-download is triggered, and clears
  `riddlon:active-package` so no pointer outlives the package it named.
- **`$lib/components/chat/*`** — shared screen chrome: `AppHeader` (60px) + `InfoBand` (46px) are
  used on every screen so header height is identical everywhere (a specific piece of design
  feedback — see chat1.md), `MessageBubble`, `Composer`, `Avatar`, etc.
- **`AppFrame` + `ChatList`** — the responsive shell (see "Responsive layout" below). Every screen
  except the splash renders its content inside `<AppFrame>`.
- **Pure logic lives in plain `.ts` files** next to their `.svelte.ts`/route consumers, so it's
  Node-testable: `$lib/story/story-display.ts`, `$lib/story/persona-input.ts`, `$lib/story/boot-steps.ts`,
  `$lib/state/active-package.ts`, `$lib/llm/{persona,director}.ts`, `$lib/state/profile.ts`,
  `$lib/i18n/format.ts`. The runes singletons themselves are deliberately thin over these — they
  had zero coverage before, which is how "the runtime activates nothing" shipped unnoticed.

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

- **With a collapsed OS titlebar the header stays 60px and stays in flow** — below `lg` it simply
  _becomes_ the titlebar: `.app-header[data-wco]` only adds `-webkit-app-region: drag` plus padding
  that keeps its `trailing` controls out from under the window buttons. It is deliberately **not**
  `position: fixed` and **not** sized to the titlebar rect: a ~33–40px strip can't hold a 36px
  avatar next to two text lines, and out of flow nothing reserved the header's space, so `InfoBand`
  slid underneath it. `layout.css` reads `env(titlebar-area-*)` exactly once, into `--rd-titlebar-*`
  on `:root` — which is also what makes the layout checkable outside an installed app, since custom
  properties can be overridden from a browser session and `env()` cannot.
- **Window Controls Overlay can't use `AppHeader` in the two-pane layout** — there are two headers
  side by side then, and only one titlebar rect. From `lg` up the header's drag region and window-
  button padding are switched off and `AppFrame` draws its own `.app-frame-titlebar` drag strip
  above both panes instead (see `layout.css`).
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
| Single test file    | `npx vitest run src/lib/story/story-display.spec.ts`       |
| Single test by name | `npx vitest run -t "storyThreads"`                         |
| Lint                | `npm run lint` (prettier `--check` + eslint)               |
| Format              | `npm run format`                                           |
| Validate stories    | `npm run stories:validate`                                 |
| Pack stories        | `npm run stories:build` → zips in `dist/stories/`          |
| Bundle for the app  | `npm run stories:bundle` → zips in `static/stories/`       |

Tests run under Vitest's `server` (Node) project, which only matches `src/**/*.{test,spec}.{js,ts}`
(not `*.svelte.{test,spec}.*`). `requireAssertions` is enabled — every test must make at least one
assertion.

## Manual browser testing

Vitest's `server` project runs in Node — no IndexedDB, no Cache Storage API, no WebGPU. Code that
touches those (`storage/`'s Cache-backed `blob-store.ts`, `llm/`'s WebGPU/WebLLM path) only really
runs in an actual browser. `fake-indexeddb` (a devDependency) covers IndexedDB in Node specs — see
any `*.integration.spec.ts` for the `import 'fake-indexeddb/auto'` + `vi.mock('$app/environment', ()
=> ({ browser: true }))` pattern — but there is **no** Node polyfill for Cache Storage, so
`blob-store.ts` and anything downstream of it can only be exercised for real in a browser.

That's what the dev-only `/dev/*` routes are for (`/dev/llm`, `/dev/import`, …, each documented at
the top of its `+page.svelte` with which issue it exists for and when to delete it): a minimal UI to
drive one module's real browser APIs by hand. Add a new one under `src/routes/dev/<name>/+page.svelte`
rather than trying to make a Node test cover what only a browser can.

To drive one from this sandbox (headless, no display):

- **Start/stop the dev server** — poll the port, don't `sleep`:
  ```bash
  npm run dev &
  timeout 30 bash -c 'until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done'
  # ...
  lsof -ti:5173 -sTCP:LISTEN | xargs -r kill
  ```
- **No `chromium-cli` here** — drive Playwright directly. It's installed globally, not as a project
  devDependency, and the pre-installed Chromium binary path is a direct executable symlink, not a
  directory (`/opt/pw-browsers/chromium/chrome-linux/chrome` does **not** exist — it's just
  `/opt/pw-browsers/chromium`):
  ```js
  import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
  const browser = await chromium.launch({
  	executablePath: '/opt/pw-browsers/chromium',
  	args: ['--no-sandbox']
  });
  ```
  Same gotcha applies if you ever fall back to a raw `require('playwright')` — it's not in this
  repo's `node_modules`, only globally at `/opt/node22/lib/node_modules/playwright`.
- **Building a test story-package ZIP** — `src/lib/content/__fixtures__/*.ts` (e.g.
  `lucys-portmonnaie.ts`) are plain data objects behind the `$lib` alias, which a standalone Node
  script run outside Vite can't resolve. `src/lib/content/__fixtures__/zip.ts`'s `zipPackageFiles()`
  turns such a files-map into real ZIP bytes using `fflate`'s `zipSync` — either add a throwaway spec
  that calls it and writes the result to disk with `node:fs`, or duplicate the handful of JSON
  objects directly in a standalone script that imports `zipSync` from
  `node_modules/fflate/esm/index.mjs` (its package.json doesn't expose a plain `fflate` subpath
  outside a bundler, so a raw Node script needs the full path).
- Always end with `console --errors`-equivalent (Playwright: listen for the page's `'console'` and
  `'pageerror'` events) before declaring success — a route can render its shell while a promise
  inside it silently rejects.

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

3. **Pure logic / Node-testable pattern** — e.g. `src/lib/story/story-display.{ts,spec.ts}`,
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

**Story packages release on their own track** (`stories.yml`, see "Story packages" above) — content
versions are independent of app versions, so release-please never sees them and `deploy.yml` filters
`story-*` tags back out.

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
