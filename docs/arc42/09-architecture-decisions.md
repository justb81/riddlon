# 9. Architecture Decisions

Short-form ADRs. Each records the context, the decision and what it costs. Decisions are appended,
never rewritten; a reversal is a new entry that supersedes an old one.

## ADR 1: Client-only PWA, no backend

**Context.** Offline capability and independence from cloud infrastructure are the top two quality
goals. A backend would make both conditional on someone running it.

**Decision.** Ship a fully client-only static site: `adapter-static`, `ssr = false`,
`prerender = true`, hosted on GitHub Pages. All state lives in browser storage.

**Consequences.** No server-side validation, no accounts, no sync, no server-issued secrets. Quota
and eviction are normal conditions. Deployment is a static file copy. Every "just add an API for it"
answer is off the table by construction.

## ADR 2: Own content package format

**Context.** Existing character-card standards (SillyTavern-style V2/V3) are widely implemented, so
adopting one would come with an ecosystem.

**Decision.** Define an own format. Do not implement compatibility with those standards.

**Rationale.** They are designed for free roleplay, not for structured story guidance with clues,
reveal rules and time logic; and their community ecosystem is strongly NSFW-oriented, which
contradicts the product's positioning.

**Consequences.** No ready-made content library, and authoring tooling has to be built. An import
adapter that maps basic fields (name, description, scenario, greeting) from foreign formats and
assigns a fresh UUID remains possible later; it is not an MVP requirement.

## ADR 3: Two id namespaces — UUIDs and symbolic refs

**Context.** The concept paper called for a UUIDv4 on every referenceable entity, but its own worked
examples used readable tags such as `clue:time-window` for clues, facts, secrets and flags.

**Decision.** Resolve the contradiction explicitly: UUIDv4 for structural, linkable entities
(packages, characters, scene nodes, achievements and references to them); colon-segmented symbolic
refs for free-form content tags (flags, clue / fact / secret ids, delayed events, outcomes).

**Consequences.** Cross-package collisions are impossible where they would matter, and authoring
stays readable where an author types ids by hand. The rule has to be remembered when adding a new
entity type; `schemas/common.ts` is the place that decides.

## ADR 4: A deterministic engine, strictly separate from the LLM

**Context.** A free-running model asked to "run the story" will improvise progress, reveal secrets
early and contradict canon.

**Decision.** A deterministic state machine owns all progress. It has no dependency on any LLM
module, and a test asserts that.

**Consequences.** The model can never advance the story by itself — which is the point, and also why
[ADR 5](#adr-5-the-director-pass-as-the-engine--llm-interface) is necessary. Engine behaviour is
fully testable in Node.

## ADR 5: The director pass as the engine ↔ LLM interface

**Context.** Packages ship no dialogue and no keyword triggers. A scene declares
`exitConditions: ["flag:…"]` and nothing in the package can ever set them. The concept paper left
this interface explicitly open.

**Decision.** After each character reply, run a second, short model call that judges whether the
active scene's exit conditions are met and which revealables were claimed. Filter every id in the
answer against what that scene declared, then apply the verdict through the engine.

**Consequences.** A player turn costs two decode passes. A hallucinated answer can only ever mean
"nothing happens". When the model is weak, the story stalls rather than derailing — which is the
safer failure, and why `/dev/story`'s director probe exists to diagnose it.

## ADR 6: The Prompt API is the internal LLM interface

**Context.** "Swap the model without touching engine or UI" is a stated requirement.

**Decision.** Adopt the W3C / Chrome Prompt API shape as the internal interface rather than
inventing one. Implement three providers against it — native, WebLLM over WebGPU, Gemini BYOK — and
let exactly one file know all three exist.

**Consequences.** A native browser model needs no adapter at all. A test forbids importing
`@mlc-ai/web-llm` outside `llm/`. Provider-specific concepts that the Prompt API has no room for
(such as web-llm's progress text) have to be approximated — see the boot-phase threshold heuristic.

## ADR 7: One local model tier

**Context.** A tiered catalog (1B for weak devices, 3B for the rest, maybe 8B) is the obvious design.

**Decision.** Ship exactly one local tier, Llama 3.2 3B. A device that cannot hold it falls to
`unsupported`, or to Gemini if the player configured a key.

**Rationale.** Live-browser testing found that the 1B tier and every other tested sub-1 GB-VRAM model
broke character or produced incoherent German. Llama 3.2 tops out at 3B, and the older 3.1 8B is not
worth doubling the download for the rare device that could hold it but has no native Prompt API.

**Consequences.** Some devices cannot play locally at all — accepted, and mitigated by
[ADR 8](#adr-8-gemini-byok-as-a-last-resort-provider). The player never picks a model; the settings
list is a read-only status view.

## ADR 8: Gemini BYOK as a last-resort provider

**Context.** After ADR 7, devices with no WebGPU and no built-in model can play nothing.

**Decision.** Allow a player-supplied Gemini API key, used only when the catalog model cannot run on
this device and a key is stored. Implement it over plain `fetch`, not an SDK.

**Consequences.** Prompt content leaves the device on this path — an explicit, opt-in trade. No SDK
keeps the build's cloud-SDK stub honest and adds no bundle weight. `create()` and `availability()`
touch no network, so resolving the provider and holding a warm-up handle cost nothing.

## ADR 9: Thread as a query parameter

**Context.** Thread keys are character or scene UUIDs from an installed package. adapter-static
without a fallback can only prerender a fixed set of path segments, and the earlier
`/chat/[thread]` route had an entry generator listing hardcoded ids.

**Decision.** Take the thread as `?thread=<key>` on a single prerendered `/chat` route.

**Consequences.** Arbitrary keys work offline with no SPA fallback and no service-worker navigation
handler. The URL is slightly less pretty. A solo thread's key is the character id; a group thread's is
the scene id.

## ADR 10: Runes singletons over pure logic

**Context.** Reactive state and testable logic have opposite constraints: runes need the Svelte
compiler, Node tests need plain modules.

**Decision.** Put framework-free logic in plain `.ts` files with Node specs, and keep the
`.svelte.ts` singletons thin wrappers over them.

**Consequences.** Most behaviour is testable without a browser. The wrappers themselves stay
under-covered, which is a known risk — a runtime that activated nothing once shipped unnoticed, which
is what prompted the split.

## ADR 11: Opt-in service-worker updates

**Context.** A cache-first worker that calls `skipWaiting()` can take over mid-session, leaving an
open page executing stale JavaScript with no way to know.

**Decision.** A new worker stays in `waiting`; the page detects it, shows a banner, and posts
`SKIP_WAITING` only when the player accepts. Activation sweeps only superseded `riddlon-shell-*`
caches.

**Consequences.** An update can be deferred indefinitely by a player who ignores the banner. In
exchange, a running session is never disrupted, and neither the asset store nor multi-gigabyte model
weights are ever swept away by an app update.

## ADR 12: Delayed events are opportunistic due-dates

**Context.** The reference story needs "about two hours later, Lucy writes again". Browsers offer no
dependable cross-platform way to run exactly-timed background work in a purely local offline PWA.

**Decision.** Model delayed events as persisted due-dates, armed when their condition holds and
evaluated on the next app open, resume or foreground. Firing is sticky.

**Consequences.** Timing is approximate by contract, and the format says so. Dramaturgy must not
depend on exact timing or on a notification being delivered. A story can express "the window has
elapsed" but not, today, "nudge the player _if_ they haven't replied" — see
[§11](./11-risks-and-technical-debt.md).

## ADR 13: Story content lives outside the app and releases separately

**Context.** Content changes at a different rate than the app, and a released package is already
installed on players' devices.

**Decision.** Author packages under `stories/`, validate them with the app's own validator, and
release each on its own `story-<slug>-v<version>` tag. Treat a released version as immutable and fail
the build when a released version's content changes without a version bump. Bundle the example
package into `static/stories/` at build time and install it through the ordinary URL importer.

**Consequences.** Bumping `version` and merging is the whole release procedure. Content releases never
redeploy the site. There is no privileged install route into the registry — the example package
exercises the same code path a third-party package does.

## ADR 14: Cloud SDKs are aliased to a throwing stub

**Context.** "No cloud calls" is easy to state and easy to violate by adding one convenient
dependency.

**Decision.** Alias Firebase, Gemini, OpenAI and Transformers.js to a throwing stub in
`vite.config.ts`.

**Consequences.** An accidental cloud dependency fails the build instead of shipping. The deliberate
Gemini path (ADR 8) has to use plain `fetch`, which is a feature, not a workaround.
