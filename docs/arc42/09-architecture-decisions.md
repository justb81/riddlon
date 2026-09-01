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

> **Superseded by [ADR 15](#adr-15-a-player-configured-openai-compatible-endpoint-preferred-over-the-local-backends).**
> The Gemini-specific provider is gone; the tier below is now a player-configured OpenAI-compatible
> endpoint, and it is preferred over the local backends rather than used as a last resort.

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

## ADR 14: No cloud SDK dependency

**Context.** "No cloud calls" is easy to state and easy to violate by adding one convenient
dependency. An earlier iteration aliased Firebase, Gemini, OpenAI and Transformers.js to a throwing
stub in `vite.config.ts` to make that violation fail the build.

**Decision.** Keep the _rule_ — no cloud SDK is a dependency of this project; the one deliberate
cloud path ([ADR 8](#adr-8-gemini-byok-as-a-last-resort-provider)) is plain `fetch` — but the build
no longer carries the stub alias that enforced it. Enforcement is by review today.

**Consequences.** `package.json` is clean, and the Gemini path stays SDK-free, which keeps the
bundle small and the request shape visible. But nothing fails if someone adds such a dependency:
`no-backend-leakage.spec.ts` guards `@mlc-ai/web-llm` only. That gap is recorded in
[§11.2](./11-risks-and-technical-debt.md#112-technical-risks); reinstating a build-level guard would
supersede this ADR.

## ADR 15: A player-configured OpenAI-compatible endpoint, preferred over the local backends

**Context.** [ADR 8](#adr-8-gemini-byok-as-a-last-resort-provider) added Gemini BYOK as a rescue
route for devices that can run nothing locally. Two things have since changed. First, the
OpenAI-compatible `/chat/completions` shape is what almost every inference server speaks — Ollama,
LM Studio, llama.cpp, vLLM, hosted gateways, and Google's own compatibility layer — so a
Gemini-specific client covers a strict subset of what one generic client would. Second, the premise
behind treating any such backend as a last resort no longer holds: the finding recorded in
[ADR 7](#adr-7-one-local-model-tier) means many current devices cannot run a usable local model at
all, and an OpenAI-compatible address is most often a server on the player's own machine or LAN,
which makes it a _stronger_ model than the 3B catalog entry rather than a compromise.

**Decision.** Replace the Gemini provider with a generic OpenAI-compatible one, configured by the
player as a base URL, a model name and an optional API key, and resolve it **first** — ahead of the
native Prompt API and WebLLM. Keep it opt-in and empty by default. Implement it over plain `fetch`,
not an SDK. Both a base URL and a model name are required before it counts as configured, so a
half-filled settings form cannot displace a working local model.

Also retire the test that forbade referencing any cloud provider SDK anywhere in `src`. It encoded
the original hypothesis that on-device inference alone would suffice, which ADR 7's testing
disproved; the _rule_ in [ADR 14](#adr-14-no-cloud-sdk-dependency) survives on its own merits, as a
bundle-weight argument rather than a prohibition on reaching an external model. The three
containment tests in `no-backend-leakage.spec.ts` — which keep `@mlc-ai/web-llm` and MLC model ids
inside `llm/` — stay, and ADR 14's description of that file is now accurate.

**Consequences.** Prompt content leaves the device whenever the configured endpoint is remote — an
explicit, opt-in trade the settings screen names, distinguishing a loopback or private-network
address (nothing leaves) from a public host (it does). Because the endpoint pre-empts a working
local model, a typo would otherwise surface only as a dead chat on the first message, so a
`testEndpoint()` connection check backs a button in settings. `resolveProvider` no longer needs the
device capabilities it took solely to gate the Gemini tier. Quality goals
[§1.2](./01-introduction-and-goals.md#12-quality-goals) 1 and 2 are reworded: offline capability now
holds for the local backends, and local inference is "preferred where the device allows" rather than
the default mode everywhere.
