---
name: create-story
description: Turn a piece of free-form story text (plot, characters, twist) into a new installable stories/<slug>/ package for this repo — manifest, character files, scene graph, clues/facts/secrets, placeholder assets — in one efficient pass. Use when the user pastes or describes a story and wants it turned into a Riddlon chat-story package, or asks to "create a new story", "add a story package", "make a story from this text".
---

# Create a story package from text

Converts prose into a package under `stories/<slug>/` matching the layout
`stories/README.md` and `docs/concept.md` §5 define, validated by the app's own
`src/lib/content/validate-package.ts`. This skill exists to do that **cheaply**: one
extraction pass, one write pass per file, one validation run. Do not re-read
`docs/concept.md`, the zod schemas, or `stories/lucys-portmonnaie/` to re-derive the format —
the reference below is already the complete, current contract. Do not spawn subagents for
this — a single pass in the main thread is strictly cheaper than delegating.

## Input

The story text is either in the skill args or the user's message. If neither contains a
story (just "create a story" with nothing to work from), ask once for the text — don't guess
a plot from nothing. Otherwise proceed without further questions: infer title, language and
structure yourself rather than interviewing the user field-by-field. Only ask if the text is
genuinely ambiguous about who the player's contact is or how it ends.

## Procedure

1. **Extract, in your head, in one pass** (see "Turning prose into a graph" below):
   title, `slug` (kebab-case ASCII, e.g. `mitternacht-in-rothenburg`), `language` (BCP-47,
   default `de` unless the input text is clearly in another language), the cast, facts,
   clues, secrets, achievements (0–3), the scene graph, and any delayed events (optional —
   omit if the plot has no natural waiting beat).

2. **Mint every ID in one shell call**, up front. Never let the model invent UUIDs by hand —
   a hand-written one is the single most common cause of a failed validation round-trip
   (wrong version/variant nibble, or an accidental duplicate). Generate exactly as many as
   you need — one package id, one per cast member, one per scene node:

   ```bash
   node -e "for(let i=0;i<N;i++)console.log(crypto.randomUUID())"
   ```

   Assign them to your extracted entities before writing anything. Flags, clue/fact/secret
   ids, delayed-event ids and achievement/character `slug`s are **not** UUIDs — they're free
   `prefix:kebab-name` strings (see reference below); write those directly.

3. **Check for character reuse.** If a cast member is plausibly the same person as someone
   in an existing `stories/*/characters/*.character.json` (same name + role), reuse that
   UUID instead of minting a new one (`stories/README.md` "Adding a story" step 2). Otherwise
   don't bother scanning other packages — a fresh UUID is correct and cheaper than checking.

4. **Write every file exactly once**, in this order, each a single `Write` call — do not
   Read a file back afterwards to double-check it; trust what you wrote:
   - `stories/<slug>/manifest.json`
   - `stories/<slug>/characters/<uuid>.character.json` — one per cast member
   - `stories/<slug>/story/story.json`
   - `stories/<slug>/story/graph.json`
   - `stories/<slug>/world/facts.json`, `world/clues.json`, `world/secrets.json` (only the
     ones you actually have content for — all three are optional in `manifest.world`)
   - `stories/<slug>/assets/covers/cover.svg` + one `assets/avatars/<char-slug>.svg` per
     character (see "Placeholder assets" below — do not spend tokens designing real art)
   - `stories/<slug>/README.md` — **spoiler-free**, unlike `stories/lucys-portmonnaie/`
     (that one is the engine's reference fixture and documents everything on purpose; a real
     story must not). Keep it to: title, a short back-of-box synopsis/hook (1–3 sentences,
     no solution, no twist, no culprit), the cast as plain names (no "witness and culprit"
     labels, no notes on who's hiding what), package id/version, and which capabilities it
     uses. **Do not include**: a walkthrough or beat→scene table, any flag chain, which
     secret unlocks when, or how the story resolves — all of that is only ever visible by
     reading the JSON itself, which is the point.

5. **Validate once**: `npm run stories:validate`. If it fails, fix only what the reported
   `path`/`message` pairs point at with targeted `Edit` calls — don't rewrite whole files
   and don't re-run validation more than needed to confirm the fix. A clean first pass is
   the point of steps 1–4; validation is a safety net, not an editing loop.

6. **Report back**: slug, cast (names), scene count, and remind the user that shipping it is
   `npm run stories:bundle` for local preview and — per `stories/README.md` — bumping
   `version` in `manifest.json` and merging to `main` for a real release. Don't run `bundle`
   or `build` yourself unless asked; they're not required to validate content.

## Turning prose into a graph

Riddlon stories are a **state graph**, not a linear script — and the graph's shape is
entirely up to the plot. `stories/lucys-portmonnaie` (recruit-scene → parallel witnesses →
report-back → closing group chat) is **one possible shape, not a template to fill in.**
Nothing requires: a single "everyone shows up at once" unlock scene, a group-chat ending
(a story can end in a 1:1 chat, or resolve mid-story and keep going with an epilogue scene,
or have no `group-chat-scene` at all), or a single delayed event (a story can have none, one,
or several `delayedEvents` scattered across it — a `condition` can be any flag reachable at
that point, not just "the first scene is done"). Let the plot dictate the graph, not the
other way round:

- **Characters can be introduced gradually, not all at once.** A cast member's
  `availability.unlockCondition` can be any flag set by any earlier scene — stagger
  `initialState: "hidden"` unlocks across the whole graph as the plot introduces people,
  rather than unlocking everyone off one "recruit" scene.
- **Branch and merge freely.** A `chat-scene`'s `next[]` can point to one scene (linear),
  several (branching, each with its own `when`), or converge multiple scenes onto the same
  target (the classic "two witnesses, one report-back" merge) — use whichever the plot
  needs, including none of the above if a thread just ends there.
- **Contradictions are optional, not a required beat.** Only split a clue across two
  scenes and mark it `conflicting: true` if the plot actually has someone lying or
  mistaken; a plot with no unreliable witness has zero conflicting clues.
- **A `group-chat-scene` is one tool among several, not a mandatory finale.** Use it
  wherever the plot actually gathers multiple characters in one place — that can be an
  opening, a midpoint confrontation, one of several such scenes, or never happen at all if
  the story stays entirely 1:1.
- **`delayedEvents` are as many or as few as the plot's pacing needs.** Each is independent:
  any `condition` flag, any `approxDelay`, any `action` (`unlock-scene:<id>` to introduce
  someone or something later, or `set-flag:<flag>` for a pure timer beat like a nudge). A
  story can chain several across its length wherever "time passes and something changes"
  actually happens in the text.

Read the input text for its actual beats — who appears when, what's learned where, whether
anything happens off a timer, how (or whether) the cast ever converges — and build exactly
that graph. Don't pad a short plot with invented scenes to hit some node count, and don't
force a longer or differently-shaped plot into the Lucy story's specific arrangement.

## Token-efficiency rules

- Don't re-read `docs/concept.md`, the `src/lib/content/schemas/*.ts` zod files, or an
  existing package to relearn the format — the reference below is complete and current.
- Generate all UUIDs in one bulk shell call (step 2), never one-by-one, never by hand.
- One `Write` per file. No draft-then-revise; extract fully in your head first, then write.
- No subagents, no worktrees — this is a single-pass, single-directory task.
- Validate once at the end, not after each file.
- Don't run `stories:build`/`stories:bundle` unless the user asks — they're not needed to
  confirm the package is valid, and they touch `dist/`/`static/` build output.

## Schema reference (condensed — this is the whole contract)

**`manifest.json`** — `format: "chatstory-package"`, `formatVersion: "1.0.0"`, `id` (uuid),
`title`, `version` (semver, start `"1.0.0"`), `author`, `language`, `entryStory:
"story/story.json"`, `entryGraph: "story/graph.json"`, `characters: [<paths>]`,
`world: [<paths>]` (omit files you don't need), `assetsBase: "assets/"`,
`minPlayerVersion` (copy the current shipped story's value), `capabilities` (subset of
`local-llm`, `delayed-events`, `multi-character-chat`, `group-chat` — include only what the
graph actually uses).

**`characters/<uuid>.character.json`** (one file per cast member — full copy, not a ref):
`id` (uuid, matches filename), `slug` (optional, readable), `displayName`, `avatar` (path
under `assetsBase`, must resolve to a file you actually wrote), `voiceStyle`,
`corePersonality`, `originPackage` (the manifest's `id`), `shareable` (bool, default `true`).

**`story/story.json`**:
- `castBindings[]`: `characterRef` (uuid), `roleInStory` (free string, e.g.
  `"quest-giver"`/`"witness"`), `knowledge.publicFacts`/`knowledge.secrets` (arrays of
  symbolic ids, default `[]`), `availability.initialState` (`"visible"`|`"hidden"`, default
  `"visible"`) + `availability.unlockCondition` (symbolic ref, required if hidden),
  `relationships` (object keyed by *other* character uuid → free label like `"friend"`),
  `identityMask` (optional: `maskedDisplayName` + `revealCondition`).
- `achievements[]` (optional, 0–3): `id` (uuid), `label`, `description` (optional). Purely
  descriptive — nothing evaluates these yet, so don't invent conditions for them.
- `delayedEvents[]` (optional): `id` (symbolic), `trigger: "time-based"`, `approxDelay`
  (ISO-8601 duration, e.g. `"PT2H"`), `condition` (symbolic ref that must hold),
  `action` (`"unlock-scene:<uuid>"` or `"set-flag:<flag>"`).

**`story/graph.json`**: `{ "nodes": [...] }`. Each node: `id` (uuid), `type`
(`"chat-scene"` | `"group-chat-scene"`), `participants` (character uuids), `goals` (strings —
**order matters**: put the line that should open the scene first), `autoOpen` (bool,
default `true` — set `false` if the character should wait for the player to write first),
`suggestedReplies` (player-facing reply chips, default `[]`), `entryConditions`/
`exitConditions` (symbolic refs, default `[]`; entry conditions may also be
`clue-confirmed:<clue-id>:<n>`), `revealables` (clue/fact/secret ids this scene may surface,
default `[]`), `relevantFactIds`/`relevantSecretIds` (optional allow-lists narrowing what
this scene's characters bring into the model prompt — worth setting once a story has more
than a handful of facts/secrets).
- `chat-scene` only: `next[]` — `{ target: <scene uuid>, when: [<flags>] }`.
- `group-chat-scene` only: `playerRole` (free string), `outcomes[]` —
  `{ id: <symbolic>, condition: <symbolic ref> }`.

**`world/facts.json`**: canon truths, never contradicted. `{ id: "fact:x", type: "fact",
statement: "<full sentence, this is what the model reads>" }`.

**`world/clues.json`**: `{ id: "clue:x", type: "clue", label: "<short, shown in Story
overview>", confirmedBy: [<character uuids>], conflicting: <bool, default false> }`.

**`world/secrets.json`**: `{ id: "secret:x", type: "secret", label: "<short>", statement:
"<full sentence — a bare label lets a small model invert who-did-what>", heldBy: [<character
uuids>], revealCondition: "<symbolic ref>" }`.

IDs: characters/package/scene-nodes = **UUIDv4** (minted in step 2). Everything else — flags,
clue/fact/secret/delayed-event ids, achievement/outcome ids inside `outcomes[].id` — is a
free `prefix:kebab-name` string; no UUIDs there.

## Placeholder assets

The story needs a cover and one avatar per character; don't spend tokens on real art. Write
a minimal, distinct placeholder SVG per file — a solid-color rounded rect with the
character's initial, e.g.:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
	<rect width="128" height="128" rx="24" fill="#5b6ee1"/>
	<text x="64" y="82" font-size="56" font-family="sans-serif" fill="#fff"
		text-anchor="middle">L</text>
</svg>
```

Vary the `fill` color and initial per character so avatars are visually distinguishable in
the chat list; the cover can reuse the same style with the story's initial letter or a
simple motif.
