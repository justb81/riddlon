# 8. Cross-cutting Concepts

- [8.1 Content package format](#81-content-package-format)
- [8.2 Player profile](#82-player-profile)
- [8.3 Story engine](#83-story-engine)
- [8.4 Local LLM inference](#84-local-llm-inference)
- [8.5 Persistence](#85-persistence)
- [8.6 Offline and PWA behaviour](#86-offline-and-pwa-behaviour)
- [8.7 UI, layout and design system](#87-ui-layout-and-design-system)
- [8.8 Internationalisation](#88-internationalisation)
- [8.9 Security and privacy](#89-security-and-privacy)
- [8.10 Testing strategy](#810-testing-strategy)
- [8.11 State management](#811-state-management)

---

## 8.1 Content Package Format

A story package is a ZIP archive. It is the only way content enters the app, and it is the shared
interface between the (not yet built) Authoring Studio and the Player.

The **normative definition** of every shape below is the Zod schema set in
`src/lib/content/schemas/`. This chapter documents intent and rationale; where the two ever diverge,
the schema wins and this chapter is the bug.

```
story-package.zip
├── manifest.json                       # the index — see §8.1.2
├── story/
│   ├── story.json                      # cast bindings, achievements, delayed events
│   └── graph.json                      # the scene state graph
├── characters/
│   └── <uuid>.character.json           # one per character identity
├── world/
│   ├── clues.json
│   ├── facts.json
│   └── secrets.json
├── assets/
│   ├── covers/
│   └── avatars/
└── signatures/
    └── checksums.json                  # generated at build time, never authored
```

Two rules about this layout are load-bearing:

- **The manifest is the index.** A file the manifest does not declare is a file the player never
  loads. The build fails on undeclared `.json` content rather than shipping something inert.
- **`world/*.json` filenames are load-bearing.** The validator picks the schema by filename suffix
  (`clues.json` / `facts.json` / `secrets.json`). A world file with any other name validates
  vacuously.

Under `stories/<slug>/` a package additionally carries a `README.md` (authoring notes) and an
optional `walkthrough.json` (playtest script). Neither is packed into the released zip.

### 8.1.1 Identifier Conventions

Package entities split into **two id namespaces**, and the split is deliberate:

| Namespace        | Used for                                                                                                        | Shape                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **UUIDv4**       | Structural, linkable entities: packages, characters, scene nodes, achievements, and every reference to them     | `3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f`                          |
| **Symbolic ref** | Free-form content tags: flags, clue / fact / secret ids, delayed-event ids, outcome ids, conditions and actions | colon-segmented, e.g. `flag:max-questioned`, `clue:time-window` |

The reasoning for UUIDs: names like `lucy` or `max` collide readily once a library grows and content
is community-generated, and a UUID makes name conflicts between independently authored packages
practically impossible. A UUID is **stable and never changed** — it is the technical reference.
`displayName` and `slug` exist only for readability, debugging and file naming, and guarantee
nothing about uniqueness.

Content tags stay readable because they are never deduplicated or cross-referenced outside their own
file, and because an author writes them by hand in a dozen places per scene.

Character file names embed the UUID (`<uuid>.character.json`) and the validator enforces that the
file name matches the identity inside.

### 8.1.2 `manifest.json`

```json
{
	"format": "chatstory-package",
	"formatVersion": "1.0.0",
	"id": "7e9c1a2b-3d4e-4f5a-8b6c-9d0e1f2a3b4c",
	"title": "Lucys Portmonnaie",
	"version": "1.2.2",
	"author": "Riddlon Team",
	"language": "de",
	"entryStory": "story/story.json",
	"entryGraph": "story/graph.json",
	"characters": ["characters/3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f.character.json"],
	"world": ["world/clues.json", "world/facts.json", "world/secrets.json"],
	"assetsBase": "assets/",
	"minPlayerVersion": "0.1.0",
	"capabilities": ["local-llm", "delayed-events", "multi-character-chat", "group-chat"]
}
```

`format` is a literal; `formatVersion`, `version` and `minPlayerVersion` are semver. Import fails
with `UNSUPPORTED_FORMAT_VERSION` when the format major is not supported, and with `PLAYER_TOO_OLD`
when the installed player is older than `minPlayerVersion`.

### 8.1.3 Characters — Identity and Cast Binding

Riddlon defines its **own** character model and deliberately implements no compatibility with
existing character-card standards (SillyTavern-style V2/V3). Those are built for free roleplay
rather than structured story guidance with clues, reveal rules and time logic, and their community
ecosystem is heavily NSFW-oriented, which does not fit the product positioning. See
[ADR 2](./09-architecture-decisions.md#adr-2-own-content-package-format).

Characters are modelled in **two layers**:

**1. Character Identity** — global, story-independent, reusable
(`characters/<uuid>.character.json`):

```json
{
	"id": "3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f",
	"slug": "lucy",
	"displayName": "Lucy",
	"avatar": "assets/avatars/lucy.svg",
	"voiceStyle": "informell, jung, leicht gestresst",
	"corePersonality": "impulsiv, loyal, misstrauisch gegenüber Autoritäten",
	"originPackage": "7e9c1a2b-3d4e-4f5a-8b6c-9d0e1f2a3b4c",
	"shareable": true
}
```

**2. Story Binding** — the per-story role overlay, inside `story/story.json`:

```json
{
	"castBindings": [
		{
			"characterRef": "3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f",
			"roleInStory": "quest-giver",
			"knowledge": { "publicFacts": ["fact:club-theft"], "secrets": ["secret:hans-tip"] },
			"availability": { "initialState": "hidden", "unlockCondition": "story-start" },
			"relationships": { "8b6d2f10-4c3a-4a91-9e2b-2f4a6b8c1d3e": "friend" },
			"identityMask": {
				"maskedDisplayName": "Unbekannt",
				"revealCondition": "flag:lucy-identified"
			}
		}
	]
}
```

- `availability` is a binary `hidden | visible` machine plus an optional `unlockCondition`.
- `identityMask` is a **sibling** of `availability`, not nested in it: gating whether a contact
  exists and masking their name are different concerns, and a binding can be `visible` and still
  masked. It implements the reference story's "Unbekannt → Lucy" opening beat, layered on the binding
  because the real name lives on the story-independent identity.
- `relationships` is keyed by the _other_ character's UUID, not an array — again to avoid name
  collisions.
- `knowledge` is what the character may bring into a prompt. A fact no binding claims never reaches
  the model at all.

Because packages must work independently of each other (the offline requirement), a referenced
character is **always shipped as a full copy inside the package**, but keeps its stable UUID. On
import the registry recognises by UUID whether the character is already known locally — from another
installed story — and links to that library entry instead of creating a redundant second identity.

### 8.1.4 Scenes and the Story Graph

The story is a **state graph**, not a prompt chain. `story/graph.json` is a flat node list:
`{ "nodes": [ … ] }`.

```json
{
	"id": "b2e4f6a8-1c3d-4e5f-9a7b-0c1d2e3f4a5b",
	"type": "chat-scene",
	"participants": ["8b6d2f10-4c3a-4a91-9e2b-2f4a6b8c1d3e"],
	"goals": ["seed-timeline", "seed-suspect-description"],
	"suggestedReplies": ["Wo warst du gestern Abend?"],
	"autoOpen": true,
	"entryConditions": ["flag:max-contact-unlocked"],
	"exitConditions": ["flag:max-questioned"],
	"revealables": ["clue:time-window", "clue:suspect-description-a"],
	"relevantFactIds": ["fact:club-theft", "fact:cloakroom-unstaffed"],
	"relevantSecretIds": [],
	"next": [{ "target": "<scene-uuid>", "when": ["flag:max-and-sabine-questioned"] }]
}
```

| Field                                   | Default | Meaning                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `participants`                          | —       | Character UUIDs in this scene                                                                                                                                                                                                                                                  |
| `goals`                                 | `[]`    | What the characters want to achieve here. **Goal order is prompt order**: the opening instruction repeats the _first_ goal, because an unanchored "write the first message" reliably produces filler.                                                                          |
| `autoOpen`                              | `true`  | Whether the character proactively sends an opening message on unlock, or stays silent until the player writes first. Goals apply either way — they decide _what_ is said, not _when_.                                                                                          |
| `suggestedReplies`                      | `[]`    | Pre-written player utterances shown as chips above the composer. Unlike `goals` these are things the _player_ might say. Shown only at the most game-like disguise level (an app setting, not a package field).                                                                |
| `entryConditions`                       | `[]`    | All must hold for the scene to unlock. An empty list unlocks at story start                                                                                                                                                                                                    |
| `exitConditions`                        | `[]`    | All must hold for the scene to complete                                                                                                                                                                                                                                        |
| `revealables`                           | `[]`    | The clue / fact refs this scene may reveal — the director's allowlist                                                                                                                                                                                                          |
| `relevantFactIds` / `relevantSecretIds` | _unset_ | Narrow which world entries reach the model for this scene, on top of what the character knows at all. A small model stays more rule-compliant with fewer, on-topic statements. Omitting either falls back to "everything the character knows", so older packages keep working. |
| `next`                                  | `[]`    | Conditional transitions, `chat-scene` only                                                                                                                                                                                                                                     |

### 8.1.5 Clues, Secrets, Facts

Three world entities, three different jobs:

| Entity     | Carries                                             | Purpose                                                                                                                                |
| ---------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Clue**   | `label`, `confirmedBy[]`, `conflicting`             | A single hint, possibly with contradicting versions per source. The `label` is also the text shown in the story overview's clue panel. |
| **Fact**   | `statement`                                         | Immutable canon truth the model must never contradict. No sources, can never conflict.                                                 |
| **Secret** | `label`, `statement`, `heldBy[]`, `revealCondition` | Knowledge a character withholds until the condition holds.                                                                             |

```json
{
	"id": "clue:time-window",
	"type": "clue",
	"label": "Ungefähre Tatzeit",
	"confirmedBy": ["8b6d2f10-…", "c1a4e7f2-…"],
	"conflicting": true
}
```

```json
{
	"id": "secret:hans-tip",
	"type": "secret",
	"label": "Hans belastet Max",
	"statement": "Hans hat gesehen, wie Max kurz vor Mitternacht allein an der Garderobe stand, genau dort, wo Lucys Jacke mit dem Portmonnaie hing.",
	"heldBy": ["3f2a1c9e-…"],
	"revealCondition": "flag:report-to-lucy-done"
}
```

Facts and secrets carry a **full sentence**, not just a label. A bare label leaves the model to
invent who did what to whom, which is exactly where a small model inverts the relationship
("Max incriminates Hans" instead of the reverse). The `label` survives on a secret as a short
summary for dev tooling and the UI.

### 8.1.6 Delayed Events

```json
{
	"id": "event:lucy-followup",
	"trigger": "time-based",
	"approxDelay": "PT2H",
	"condition": "flag:report-to-lucy-done",
	"action": "unlock-scene:<scene-uuid>"
}
```

**These are explicitly not guaranteed timers.** They are persisted due-dates evaluated on the next
app contact (open, resume, active use), not reliable background job execution: browsers offer no
dependable cross-platform way to run exactly-timed background work in a purely local offline PWA.
Optional system notifications may supplement this but must never be a precondition of the
dramaturgy. See [ADR 12](./09-architecture-decisions.md#adr-12-delayed-events-are-opportunistic-due-dates).

An event **arms** when its condition holds and **fires** once `approxDelay` has elapsed since arming.
Firing is sticky — a fired event never fires twice.

### 8.1.7 Group Chat Scenes

A group chat is its own scene type. It shares the whole base shape of a chat scene, but `playerRole`
and `outcomes` replace `next`:

```json
{
	"id": "<scene-uuid>",
	"type": "group-chat-scene",
	"participants": ["3f2a1c9e-…", "8b6d2f10-…", "c1a4e7f2-…"],
	"autoOpen": true,
	"entryConditions": ["flag:hans-info-confirmed"],
	"playerRole": "confront-max-with-evidence",
	"outcomes": [{ "id": "max-confesses", "condition": "flag:evidence-presented" }]
}
```

The format defines **no turn-taking rules**. Who answers in a group chat is an app-side decision,
implemented as `pickResponder()` in `llm/persona.ts` and documented there.

### 8.1.8 Condition and Action Vocabulary

One vocabulary is shared by every conditional field in the format: `entryConditions`,
`exitConditions`, `next[].when`, `outcomes[].condition`, `delayedEvents[].condition`,
`castBindings[].availability.unlockCondition` and `secrets[].revealCondition`.

| Condition                      | True when                                                                   |
| ------------------------------ | --------------------------------------------------------------------------- |
| `story-start`                  | Always                                                                      |
| `flag:<name>`                  | The flag is set (keyed by the full ref, e.g. `flag:max-questioned`)         |
| `not:<condition>`              | The inner condition is false                                                |
| `scene-unlocked:<uuid>`        | That scene is unlocked                                                      |
| `scene-completed:<uuid>`       | That scene is completed                                                     |
| `clue-known:<clue-id>`         | At least one claim has been recorded for that clue                          |
| `clue-resolved:<clue-id>`      | The clue has been resolved                                                  |
| `clue-confirmed:<clue-id>:<n>` | At least `n` distinct character sources have claimed it — the evidence gate |
| `secret-revealed:<secret-id>`  | That secret's own `revealCondition` holds (recursive)                       |
| `outcome-reached:<outcome-id>` | That outcome has been reached                                               |

Lists combine with **AND**; an empty list is vacuously true. There are no boolean operators beyond
`not:`. An unknown prefix evaluates to `false` rather than throwing — a package from a future or
older format must never hard-crash the player — but is collected so a caller or a future authoring
linter can surface it.

| Action                    | Effect                                                   |
| ------------------------- | -------------------------------------------------------- |
| `unlock-scene:<uuid>`     | Force-unlock a scene regardless of its entry conditions  |
| `set-flag:<flag>`         | Set a flag                                               |
| `unlock-character:<uuid>` | Force a character visible regardless of its cast binding |

An unrecognised action prefix is ignored, for the same forward-compatibility reason.

### 8.1.9 Validation

`validate-package.ts` is the single validator, used identically by the app's importer, the story
build script and CI. Its error codes:

| Code                         | Meaning                                                           |
| ---------------------------- | ----------------------------------------------------------------- |
| `MISSING_FILE`               | A file the manifest declares is not in the archive                |
| `SCHEMA_ERROR`               | A file does not match its schema (path points at the exact field) |
| `UNSUPPORTED_FORMAT_VERSION` | The package's format major is not supported by this player        |
| `PLAYER_TOO_OLD`             | The installed player is older than `minPlayerVersion`             |
| `DUPLICATE_ID`               | Two entities share an id                                          |
| `DANGLING_REFERENCE`         | A reference points at something the package does not contain      |
| `FILENAME_ID_MISMATCH`       | A character file's name does not match the identity inside it     |

What validation deliberately does **not** do is simulate the flag graph. A scene nothing ever
unlocks, or a condition flag with a typo that nothing ever sets, validates cleanly and then never
appears in play. `npm run story:playtest` exists to catch exactly that — see
[§7.3](./07-deployment-view.md#73-story-package-build-and-release).

---

## 8.2 Player Profile

The player needs a minimal but real profile so characters can address them correctly. There is
deliberately **no gender field** — the profile asks directly for the form of address, with free text
rather than a fixed list.

Required: the form of address. Recommended but optional: display name, avatar, short bio.

```json
{ "displayName": "Alex", "addressAs": "they" }
```

```json
{
	"displayName": "Alex",
	"pronouns": { "subject": "they", "object": "them", "possessive": "their" },
	"avatar": "player-avatar.png",
	"shortBio": "Interessiert an Geschichte, Rätseln und alten Archiven."
}
```

The two shapes are alternates of the same concern; the schema requires **at least one** of
`addressAs` and `pronouns`. A story may declare `playerProfileDefaults` in `story/story.json` to say
which profile fields it needs; the shape beyond the field name is unspecified and passed through
without deep validation.

At runtime the profile is split across two homes: nickname, bio and pronouns belong to the package
format's `PlayerProfile` and live in IndexedDB (`playerProfileStore`); disguise level and the
notification toggle are app-level settings and live in `localStorage` under `riddlon:app-settings`.
There is deliberately no model choice in the profile — which model runs is the app's decision, not
the player's.

---

## 8.3 Story Engine

`StoryEngine` is a deterministic state machine over one `StoryBundle` with **zero dependency on any
LLM backend**. It decides what is allowed to happen; it never decides what a character says.

**State** (`EngineState`) is plain, JSON-serialisable data — no class instances, no runes — so it
round-trips through the save store with no framework in between: flags, unlocked / completed scene
ids, reached outcome ids, force-unlocked character ids, per-clue claim lists, and pending delayed
events.

**Effects** are the sole outward contract. Every mutating method returns the `EngineEffect[]` it
produced, and callers observe the engine through those effects plus the read-only queries — never by
diffing state themselves:

`flag-set` · `scene-unlocked` · `scene-completed` · `outcome-reached` · `character-unlocked` ·
`clue-recorded` · `clue-conflict-detected` · `clue-resolved` · `delayed-event-armed` ·
`delayed-event-fired`

**Clues** record every claim in order, keyed by source character; a later claim never overwrites an
earlier one. That is what makes `clue-confirmed:<id>:<n>` an evidence gate and what surfaces
contradictions to the UI.

**Characters** are visible when their cast binding says so — `initialState: visible`, or
`unlockCondition` satisfied — or when an `unlock-character:` action forced them. Masked characters
are reported separately, so the UI can show a placeholder name until the reveal condition holds.

---

## 8.4 Local LLM Inference

### 8.4.1 The Provider Chain

`src/lib/llm/` does not define a backend vocabulary of its own: **the interface _is_ the
[W3C / Chrome Prompt API](https://webmachinelearning.github.io/prompt-api/)** —
`LanguageModel.availability()` / `create()` / `promptStreaming()`. Three providers implement it, and
`provider.ts` is the only file that knows any of them exists.

| Order | Provider   | When it wins                                                                                                                           |
| ----- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **Native** | The browser has its own built-in Prompt API. Costs no download, so it wins whenever present.                                           |
| 2     | **WebLLM** | `@mlc-ai/web-llm` over WebGPU, for browsers with no native model. One ~1.9 GB download.                                                |
| 3     | **Gemini** | Only when the catalog model cannot run on this device (no WebGPU, or not enough VRAM) **and** the player has stored their own API key. |

Gemini is a rescue path for devices that can play no other way, never an alternative players opt
into for quality. `resolveProvider(modelId, capabilities?)` takes the device capabilities as an
optional argument purely so this module never has to probe WebGPU itself; callers that omit it get
the behaviour of an unsupported WebLLM model failing outright.

`llm.svelte.ts` counts a device as usable once a Gemini key is stored, even with no WebGPU —
otherwise the loader would fail before ever reaching the Gemini branch. `localUnusable` deliberately
ignores any stored key (native and WebLLM both fail there) and is what gates whether the settings
screen shows the Gemini key field at all, so the field does not vanish the moment a key makes the
device supported again.

### 8.4.2 Model Catalog

`catalog.ts` is the only place a Riddlon model id maps to a concrete MLC model. One entry today:
`llama-3.2-3b`, also `DEFAULT_MODEL_ID`, chosen for German dialogue.

- **The player never picks a model.** The settings screen's model list is a read-only status view.
- **No smaller tier.** A 1B fallback existed; live-browser testing found that it, and every other
  tested sub-1 GB-VRAM model, broke character or produced incoherent output. A device that cannot
  hold 3B falls to the `unsupported` state (or the Gemini fallback) rather than to a smaller,
  unusable local tier.
- **No larger tier.** Llama 3.2 tops out at 3B, and the older Llama 3.1 8B is not worth doubling the
  download for the rare device that could hold it but has no native Prompt API.
- **`approxDownloadBytes` and `vramRequiredMB` are different figures and must never be conflated.**
  The first is what the player waits for and what the progress bar tracks; the second is peak GPU
  memory and is only used for the capability check. `vramRequiredMB` is copied from web-llm's own
  `prebuiltAppConfig`, and `catalog.spec.ts` asserts the copies stay in sync — `catalog.ts` itself
  never imports `@mlc-ai/web-llm`, because that heavy dependency is reachable from far outside the
  WebLLM-only code path.

### 8.4.3 Persona Prompting

`persona.ts` builds the prompt for **one character in one scene**, purely:

- identity and voice from the character file
- role and knowledge from this story's cast binding
- `goals` from the scene
- `relationships` resolved to names. A solo scene has no other participants, so this is the only
  thing that lets a character name someone who is not in the room — a goal like
  `name-max-and-sabine-as-witnesses` is unreachable without it.
- the canon rule from [§8.1.5](#815-clues-secrets-facts): facts must not be contradicted, and a
  secret stays back until its `revealCondition` holds — which is why revealable and withheld secrets
  are separate lists in the prompt.

`buildOpeningInstruction()` repeats the scene's **first** goal in the turn instruction: goals sit in
the system prompt, but an unanchored "write the first message" reliably produces filler, so goal
order is prompt order for openers.

`persona-input.ts` (in `story/`) composes bundle + engine state into this function's input. It is
pure and spec'd against the real package under `stories/` rather than a fixture, because anything it
forgets to pass is knowledge the model can never have, and that failure is invisible at runtime —
the story simply stops advancing.

### 8.4.4 The Director Pass

Packages ship no dialogue and no keyword triggers: a scene declares `goals`, `exitConditions` and
`revealables`, and nothing in the package could ever set those flags. Something has to translate free
conversation into those symbols. **That is the director, and it is the only thing that advances the
graph.**

After each character reply, a second, short model call judges whether the active scene's exit
conditions are now met and which revealables were claimed. The verdict is applied through the engine.

Both halves — prompt building and answer parsing — are pure and spec'd. The parser is deliberately
paranoid: a local 3B model will wrap its JSON in prose, invent ids, or return nothing. Every id is
filtered against what **the active scene itself** declared, so the worst case of a bad answer is
"nothing happens", never "some other flag got set".

Two near-miss shapes are common enough that dropping them outright would stop the story in practice,
so they are normalised **before** the allowlist check, never after: a flag reported as a bare id
(`"lucy-identified"` instead of `"flag:lucy-identified"`, sometimes even inside the `clues` array),
and a character named by display name instead of UUID.

### 8.4.5 Sessions and History

`adapter.ts` defines `LlmAdapter` / `LlmSession`, the surface `state/` codes against, and injects its
provider so the real logic is exercised in Node with no GPU.

- Every logical session — one per character, plus the director — gets its own real backend handle on
  all three providers. WebLLM affords that because `webllm-direct.ts` keeps **one** persistent
  `MLCEngine` and resets the KV cache on switch, rather than reloading multiple gigabytes.
- **`createSession(key, config)` returns the existing session but adopts the new config.** This looks
  wrong and is essential: a thread keeps one session per character for the whole story while the
  scene driving their goals advances underneath it, so the persona must be re-applied every turn.
  Conversation history is kept; `seedTurns` only ever applies to the first call. Because the
  instruction lives inside the backend handle on every provider, that handle is destroyed and rebuilt
  from replayed history.
- Inference runs on the **main thread** — there is no worker variant here. Typing and spinner
  animations must stay CSS-only so they survive the decode loop.
- `isModelCached()` asks web-llm's `hasModelInCache` _and_ keeps a `localStorage` marker.
  `webllm-direct.ts`'s own `availability()` always reports `available` — it cannot tell "not yet
  downloaded" from "downloading" without loading the engine — so it cannot answer this itself. Each
  fallback is wrong in a different way; together, the worst case is one unnecessary progress bar.

---

## 8.5 Persistence

| Store               | Technology                       | Contents                                                                             |
| ------------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| `packages`          | IndexedDB `riddlon` v1           | Installed package manifest, parsed content, cover reference, size, install time      |
| `characters`        | IndexedDB                        | The local, story-independent character library, keyed by character UUID              |
| `saves`             | IndexedDB                        | Flags, unlocked / completed scenes, clue state, pending delayed events, chat history |
| `playerProfile`     | IndexedDB                        | The player profile (singleton record)                                                |
| `riddlon-assets-v1` | Cache Storage                    | Package binary assets, content-addressed                                             |
| model weights       | Cache Storage (owned by web-llm) | Multi-gigabyte model files                                                           |
| `riddlon:*`         | `localStorage`                   | Active package, app settings, onboarding state, LLM cache markers, Gemini key        |

Design notes:

- **Chat history is part of the save**, not a separate store, so a save reset takes the conversation
  with it and nothing can outlive the playthrough it belongs to.
- **History loads per save id through a serialised queue**, so two activations cannot interleave into
  one thread.
- **Assets are content-addressed**, so two packages shipping the same avatar store it once.
- **Resetting never deletes model weights.** See [§6.6](./06-runtime-view.md#66-reset).

---

## 8.6 Offline and PWA Behaviour

- **Client-only rendering.** `+layout.ts` sets `ssr = false` and `prerender = true`; adapter-static
  emits a prerendered shell that hydrates and then runs entirely in the browser.
- **Cache-first shell.** `service-worker.ts` precaches `build` + `files` from `$service-worker` under
  a `riddlon-shell-<version>` cache and serves them cache-first.
- **Manual registration.** `vite.config.ts` disables SvelteKit's automatic registration;
  `+layout.svelte` registers the worker in production and actively unregisters leftovers in dev, so
  a cache-first worker can never mask fresh dev output.
- **Opt-in updates.** A new worker stays in `waiting` until the player accepts the banner. See
  [§6.5](./06-runtime-view.md#65-application-update).
- **Scoped cache sweeping.** Activation deletes only superseded `riddlon-shell-*` caches; the asset
  store and the model weights are never swept.
- **Installability.** `static/manifest.webmanifest` declares name, icons and standalone display; the
  manifest link and `theme-color` live in `src/app.html`.
- **No SPA fallback.** adapter-static is configured without one, which is why the conversation route
  takes its thread as a query parameter — see
  [ADR 9](./09-architecture-decisions.md#adr-9-thread-as-a-query-parameter).

---

## 8.7 UI, Layout and Design System

### Design reference

`docs/design/riddlon-app-mockup.dc.html` (plus `support.js`) is the Claude Design prototype for the
Player PWA. It covers every planned screen with real interaction states and German copy: splash and
boot (first-run model download versus warm start), chat overview, 1:1 and group conversation
including the contradiction / clue-flag UI, the Riddlon system chat, the story overview, settings and
profile, toasts, and the full-screen case-solved celebration.

Read it directly for exact copy, layout and interaction states. It is a static reference, not
runnable standalone — it depends on Claude Design's `support.js` runtime and a React global.
**Recreate the visuals in Svelte; do not port the prototype's DOM structure.** Its model names
("Phi-3 Mini", "Llama 3 8B") and its sizes are placeholders that the real catalog supersedes.

### Visual language

The key rule the mockup states about itself: the rust/terracotta accent (`#c1502e`) is used
**exclusively** for progress, contradictions and achievements. Everything else is navy (`#151a26`)
and cream, so "something is rust-coloured" always means "this is a game signal, not just chat".

Typography: **DM Sans** for UI, **IBM Plex Mono** for labels, timestamps and system text,
**Instrument Serif** for the splash wordmark and the celebration headline. Semantic tokens — colour,
type scale, radius, container widths — live in `src/routes/layout.css` as Tailwind `@theme` values,
so `bg-accent-strong`, `text-danger`, `max-w-chat` and friends are ordinary utilities.

### Responsive layout

The design reference is a phone mockup, but the app also runs in a desktop browser window.
`AppFrame.svelte` wraps every screen except the splash and switches shape **in CSS only** — no
media-query rune, no resize listener, so there is no layout flash on load:

| Breakpoint           | Shape                                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| below `lg` (1024 px) | Pass-through. The route fills the viewport exactly as on mobile.                                                                                                                              |
| from `lg`            | Two-pane desktop layout: `ChatList` docks as a persistent left sidebar (336 → 380 → 420 px) beside the open route and marks the active thread. `/chats` becomes "sidebar + placeholder pane". |
| from `xl`            | The frame caps at `max-w-frame` (1600 px) and centres itself on `bg-surface-sunken` with a border, radius and shadow.                                                                         |

`ChatList` is the extracted `/chats` body, mounted exactly once; it moves between "whole screen" and
"sidebar" purely through visibility classes. Two width tokens cap content _inside_ the frame so text
never runs its full width: `max-w-chat` (60 rem, message column and composer) and `max-w-pane`
(46 rem, the reading columns — settings, story overview, library).

### Window Controls Overlay

With a collapsed OS titlebar the header stays 60 px and stays **in flow**: below `lg` it simply
_becomes_ the titlebar, and `.app-header[data-wco]` only adds a drag region plus padding that keeps
its trailing controls clear of the window buttons. It is deliberately not `position: fixed` and not
sized to the titlebar rect — a ~33–40 px strip cannot hold a 36 px avatar next to two text lines, and
out of flow nothing reserves the header's space, so the info band slides underneath it.

From `lg` up there are two headers side by side but only one titlebar rect, so the header's drag
region and window-button padding are switched off and `AppFrame` draws its own drag strip above both
panes. `layout.css` reads `env(titlebar-area-*)` exactly once into `--rd-titlebar-*` on `:root`,
which is also what makes the layout checkable outside an installed app: custom properties can be
overridden from a browser session, `env()` cannot.

### Things that look like bugs but are not

- **A fresh device has an empty chat list.** Nothing is auto-installed; the Riddlon system chat is
  the only row until a package is imported.
- **A story can be installed and still show no contacts.** `/chats` lists only what the engine
  reports as visible, so a character hidden until some flag appears exactly when the story unlocks
  them.
- **Without a loaded model a thread is empty and says so.** Every message, including a scene's
  opening line, is generated.
- **The story overview lists achievements but never awards them.** The achievement schema is
  id/label/description only, so a package can name an achievement but not say when it is earned.
  Only reached `outcomes` are real engine state. See [§11](./11-risks-and-technical-debt.md).
- **Chapter numbers are scene positions.** The format has no scene titles or chapter numbering, so
  the timeline reports authored order and the participants' names rather than inventing structure.
- **The "Fallakte ansehen" button** on the case-solved celebration literally says that, not
  "Storyübersicht" — that is the original design's wording for the screen `/story` now carries.

---

## 8.8 Internationalisation

`src/lib/i18n/` is German-only today, but every UI-chrome string goes through `t('some.key', vars)`
against `de.json`, so adding a language is "add `en.json`, add one line to `dictionaries`" rather
than a rewrite. `vars` does `{name}`-style interpolation (`format.ts`, pure and spec'd).

**Story content — character dialogue, clue text, achievement titles — is never in the dictionary.**
It comes from the installed package and carries the package's own `language`.

---

## 8.9 Security and Privacy

- **No backend, no accounts, no telemetry.** There is nothing to breach server-side because there is
  no server.
- **A playthrough never leaves the device** on the native and WebLLM paths. The only outbound traffic
  during play is nothing at all.
- **The Gemini path is opt-in and explicit.** The player's own key is stored under
  `riddlon:llm:gemini-key` in `localStorage` — separate from the profile store precisely because it
  must survive a reload — and is sent only inside the Gemini request itself. Prompt content does
  leave the device on this path; that is the trade the player makes to play at all on a device with
  no local model.
- **Cloud SDKs cannot creep in.** `resolve.alias` in `vite.config.ts` points Firebase, Gemini, OpenAI
  and Transformers.js at a throwing stub, so an accidental import fails the build rather than quietly
  shipping a network dependency. The deliberate Gemini path uses plain `fetch` and is unrelated to
  that stub.
- **Imported content is untrusted.** Every package is schema-validated before anything is stored, all
  ids are checked for duplicates and dangling references, and the director's output is filtered
  against a per-scene allowlist so neither a package nor a model can set state the active scene did
  not declare.

---

## 8.10 Testing Strategy

| Layer                                 | How it is covered                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Pure logic                            | Vitest `server` (Node) project over `src/**/*.{test,spec}.{js,ts}`. `requireAssertions` is on — every test must assert. |
| IndexedDB code paths                  | `fake-indexeddb` in `*.integration.spec.ts` (`import 'fake-indexeddb/auto'` plus a `$app/environment` mock).            |
| The engine, end to end                | `engine.spec.ts` plays the reference story's fifteen steps through the **shipped** package read off disk.               |
| Shipped content                       | `story-packages.spec.ts` validates every package under `stories/` on a plain `npm test`.                                |
| Graph reachability                    | `npm run story:playtest` replays a scripted walkthrough through the real engine — no LLM, no browser.                   |
| Module boundaries                     | `no-llm-dependency.spec.ts` and `no-backend-leakage.spec.ts`.                                                           |
| Cache Storage, WebGPU, real inference | **Not automatable here** — no Node polyfill for Cache Storage, and neither CI nor the dev sandbox has a GPU.            |

The shipped package is the engine's acceptance fixture, not a copy of it:
`__fixtures__/lucys-portmonnaie-walkthrough.ts` reads `stories/lucys-portmonnaie/` off disk (Node
only — specs, never app code), so the walkthrough plays through the exact content that gets released.
Editing the story means editing the JSON.

**Dev harness routes** cover what Node cannot. Each is documented at the top of its `+page.svelte`
with why it exists and when to delete it:

| Route         | Purpose                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dev/llm`    | Drive a real inference turn by hand, including a force-WebLLM harness                                                                                                                        |
| `/dev/import` | Drive the real ZIP / URL import against real browser storage                                                                                                                                 |
| `/dev/story`  | Play against the real engine, and run the **director probe**: pick a scene, edit the transcript, and see the exact prompt, the raw answer and the parsed verdict without playing a chat turn |

The director probe exists because a verdict that silently sets nothing is otherwise invisible — the
story just stops advancing — and it is how you tell a model problem from a story problem, since the
story's own flag chain is already asserted in Node.

Add a new `/dev/<name>` route rather than trying to make a Node test cover what only a browser can.

---

## 8.11 State Management

App-wide state lives in `src/lib/state/*.svelte.ts` as plain classes exported as singletons, using
`$state` runes. Anything touching browser APIs is guarded so it stays inert during prerender and in
non-supporting environments (`browser` from `$app/environment`, plus feature detection).

**Pure logic lives in plain `.ts` files next to their `.svelte.ts` consumers**, so the Node test
project can reach it: `story/story-display.ts`, `story/persona-input.ts`, `story/boot-steps.ts`,
`state/active-package.ts`, `state/profile.ts`, `state/reset.ts`, `llm/persona.ts`, `llm/director.ts`,
`i18n/format.ts`. The runes singletons are deliberately thin over these — they had zero coverage
before, which is how "the runtime activates nothing" once shipped unnoticed.

Two subtleties worth knowing before touching `storyRuntime`:

- **`bundle` is a `$state.raw` field, not a getter over the active session.** A getter can never
  invalidate a `$derived` that reads it, and the failure is silent: a derived that first runs before
  activation short-circuits on `bundle == null`, registers no dependency, and stays empty forever.
  `engine` is still a plain getter and is therefore for imperative callers only.
- **`onActivate()` is how the chat session hears about a late activation** — an import into an empty
  library, or a switch from the library screen. A direct call would be an import cycle.

`#doInit` walks a candidate list and activates the first package that yields a loadable bundle, so
one bad record can never leave the runtime with no session while the library still lists a story.
