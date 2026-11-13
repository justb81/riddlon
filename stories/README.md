# Story packages — authoring guide

Source form of the installable story packages this repository publishes. One directory here = one
package = one independently versioned GitHub release.

The player app itself ships **no** story content: a story arrives through ZIP or URL import like any
third-party package would. This directory is where a story is written; nothing under `src/lib/` may
contain authored content.

| Package                                      | Story             | Role                                                               |
| -------------------------------------------- | ----------------- | ------------------------------------------------------------------ |
| [`lucys-portmonnaie/`](./lucys-portmonnaie/) | Lucys Portmonnaie | The reference story and the engine's end-to-end acceptance fixture |

**This file is a task guide.** The format is specified in
[`docs/arc42` §8.1](../docs/arc42/08-crosscutting-concepts.md#81-content-package-format), and the
build and release mechanics in
[§7.3](../docs/arc42/07-deployment-view.md#73-story-package-build-and-release). Read those for field
semantics and rationale; read this for the steps.

## What a package directory contains

The unzipped archive, byte for byte, minus the generated `signatures/checksums.json`:

```
stories/<slug>/
├── manifest.json                       # the index: declares every other file
├── story/
│   ├── story.json                      # castBindings, achievements, delayedEvents
│   └── graph.json                      # the scene state graph
├── characters/<uuid>.character.json    # one per character identity
├── world/
│   ├── clues.json
│   ├── facts.json
│   └── secrets.json
├── assets/{covers,avatars}/            # cover + avatar images
├── README.md                           # authoring notes — NOT packed into the zip
└── walkthrough.json                    # optional playtest script — NOT packed into the zip
    walkthrough-<branch>.json            # one more per branch worth replaying, also not packed
```

Two traps worth knowing before you start:

- **A file the manifest doesn't declare is a file the player never loads.** The build fails on
  undeclared `.json` content rather than shipping something inert.
- **`world/*.json` filenames are load-bearing.** The validator picks the schema by filename suffix
  (`clues.json` / `facts.json` / `secrets.json`). A world file with any other name validates
  vacuously.

## Adding a story

1. **Create the directory and mint ids.** `mkdir stories/<slug>`. `manifest.id` must be a fresh
   UUIDv4 — generate one, never copy another package's. Scene nodes, characters and achievements are
   UUIDs too; flags, clue/fact/secret ids and delayed-event ids are readable `prefix:kebab-name`
   tags. The split is explained in
   [§8.1.1](../docs/arc42/08-crosscutting-concepts.md#811-identifier-conventions).
2. **Decide on character reuse.** Character UUIDs are stable and global: reuse an existing
   character's UUID to have the player's library recognise them across stories, and mint a new one
   otherwise.
3. **Write the files** listed above. Things that are easy to get wrong:
   - Facts and secrets carry a **full sentence** in `statement`, not just a label — a bare label lets
     a small model invent who did what to whom.
   - A character only knows what their cast binding's `knowledge.publicFacts` lists. A fact nobody
     knows never reaches the model, and a goal that depends on it becomes unreachable.
   - **Goal order is prompt order**: a scene's first goal is what the opening message is built
     around. Put the beat that actually opens the scene first.
   - **Every goal must be visible in the conversation.** A chat scene completes only once the
     director has judged _each_ of its goals reached
     ([§8.4.4](../docs/arc42/08-crosscutting-concepts.md#844-the-director-pass)). A goal that only
     describes how a character behaves afterwards ("go quiet") gives the director nothing to see,
     and the scene may never end.
   - **Give every goal its two texts** in the scene's `goalDetails`, in the story's language:
     `intent` says what the character pursues ("Sag, wann es ungefähr passiert ist"), and
     `reachedWhen` says what the director should see in the chat ("Max hat eine ungefähre Uhrzeit
     genannt"). Without them the model gets the bare English slug. Name the character in
     `reachedWhen`, unless the scene masks them, and keep it something a transcript can show.
     The same goes for every flag the director may set, an event or a group scene's ending: give it a
     `reachedWhen` in `flagDetails`, and say what does _not_ count ("Eine Frage, ob sie etwas
     gesehen hat, ist kein Vorwurf"). The why is in
     [ADR 19](../docs/arc42/09-architecture-decisions.md#adr-19-goal-text-as-a-separate-per-scene-map-in-two-parts).
   - An empty `entryConditions` list unlocks the scene at story start. If a scene must only be
     reachable through a delayed event, give it a sentinel condition nothing else sets.
4. **Validate**: `npm run stories:validate`, until clean.
5. **Playtest** (see below) to confirm the graph is actually reachable.
6. **Open a pull request.** CI validates it; merging to `main` releases it.

If you would rather start from prose than from JSON, the `create-story` skill
(`.claude/skills/create-story/`) turns a plot description into a complete package in one pass.

## Commands

```bash
npm run stories:validate                 # validate every package, write nothing
npm run stories:build                    # + write dist/stories/<slug>-v<version>.zip
npm run stories:bundle                   # + write static/stories/ for local app preview
npm run story:playtest -- stories/<slug> # replay a walkthrough through the real engine
```

`npm test` validates every package here too, so broken content fails ordinary CI rather than only
the release workflow.

## Playtesting

Validation checks schema shape, required files, duplicate ids and dangling references. It **never
simulates the flag graph**, so a scene nothing ever unlocks, or a condition flag with a typo that is
never set, validates cleanly and then silently never appears in play.

```bash
npm run story:playtest -- stories/<slug> [path/to/walkthrough.json]
```

`scripts/playtest-story.mjs` replays a scripted walkthrough through the real engine — no LLM, no
browser. Each step in `walkthrough.json` (defaulting to `stories/<slug>/walkthrough.json`) stands in
for what a real conversation turn would have produced, or for time passing:

| Step          | Stands in for                                                        |
| ------------- | -------------------------------------------------------------------- |
| `setFlag`     | A director verdict setting a flag                                    |
| `claimClue`   | A character making a claim about a clue                              |
| `resolveClue` | The player resolving a contradiction                                 |
| `action`      | An `unlock-scene:` / `set-flag:` / `unlock-character:` action firing |
| `advance`     | Time passing (an ISO-8601 duration; fires any due delayed events)    |
| `resume`      | Re-checking without advancing time                                   |

It prints every effect as it replays, then a coverage summary — scenes unlocked and completed,
characters made visible, outcomes reached, achievements earned, delayed events armed and fired — so
an orphaned scene, a dead flag or an achievement whose conditions can never all hold shows up as
"never …" instead of shipping invisibly. An incomplete walkthrough does not fail the run: it only
covers the branches it scripts.

A branching story therefore wants one walkthrough per branch. Any file named `walkthrough*.json` is
authoring-only and never packed, so a second one costs nothing.

See [`lucys-portmonnaie/walkthrough.json`](./lucys-portmonnaie/walkthrough.json) for a worked example
covering all fifteen steps of the reference story, and
[`walkthrough-false-accusation.json`](./lucys-portmonnaie/walkthrough-false-accusation.json) for the
branch where the player accuses the wrong person — the run that proves the "Ohne Falschbeschuldigung
gelöst" achievement can actually be missed.

## Measuring the director

A playtest proves the graph _can_ advance. Whether it does in play depends on the director pass
reading free conversation correctly
([§8.4.4](../docs/arc42/08-crosscutting-concepts.md#844-the-director-pass)), and CI cannot run a
model. `director-cases.json` next to the package is the repeatable measurement for that. Like the
walkthroughs, it is authoring-only and never packed.

### Writing cases

Each case is one scene, one fixed transcript and the answer every question should get:

```jsonc
{
	"id": "sabine-accused", // unique, names the row in the results
	"scene": "8e888a69-…", // graph node id
	"reachedGoals": [], // goals already held before this transcript
	"names": { "<uuid>": "Unbekannt" }, // only for a masked character
	"transcript": ["Sabine: …", "Du: …", "Sabine: …"], // "Du" becomes the player's nickname
	"expect": {
		"goals": { "seed-timeline": true, "seed-location": false }, // every open goal
		"events": { "flag:false-accusation": true }, // every settable flag
		"outcome": "none", // group scenes only
		"clues": { "clue:time-window": "<uuid>" } // claims the transcript does contain
	}
}
```

Write at least one case per scene where every goal holds, and one where they don't hold yet. For
each event, add an innocent near miss as well as the real thing. A case must name exactly the
questions its scene asks. `npm test` checks every case file against its graph, so a renamed goal
fails CI instead of quietly skewing the next measurement.

### Running a measurement

1. `npm run dev`, then install and start the story under `/chat/riddlon`, and load the model you are
   measuring under `/`.
2. Open `/dev/story` and go to **Director cases**. The red list under the buttons must be empty.
3. Leave **authored criteria** on; switch it off once to measure what the criteria are worth
   against the bare slugs. Keep the file's `runs` (3; Chrome's built-in model is not deterministic) and the window at 6
   unless the window itself is what you are measuring. Then press **Run cases**.
4. When it finishes, copy the **total** row and press **Download runs**. _unreadable_ counts
   answers with no JSON in them; they are kept out of every other column, so a model that answers
   in prose cannot look careful by "saying no" to everything.

Measure every model the app offers as a default, one after another, each on a fresh page load:
Chrome's built-in model, then WebLLM's `llama-3.2-3b`, plus `llama-3.1-8b` where the device fits it.

### Recording the numbers

- **Post the total row per model** as a comment on the director's tracking issue, with the date,
  commit, model and window. Keep the form "_a_ of _b_", never a bare percentage.
- **Update [§11.2](../docs/arc42/11-risks-and-technical-debt.md)** when a number changes what is
  known about a risk.
- **Keep the raw answers.** Put the downloaded file in `src/lib/llm/__fixtures__/director-answers/`
  under its downloaded name. `director-recorded.spec.ts` then re-parses every answer against the
  verdict recorded with it, which pins the parser against what models actually produce. If a
  deliberate parser change alters a verdict, update that file's `verdict` in the same commit.

## Releasing

**Bump `version` in the package's `manifest.json` and merge to `main`** — that is the whole
procedure. Each package releases on its own tag (`story-<slug>-v<version>`), independently of the app
and of every other story.

**A published version is immutable.** Its zip is already installed on players' devices, so CI
compares each freshly built checksum against the released one and fails with "bump the version" on
any difference. Editing a package's `README.md` never trips this — it is not packed.

Story versions follow semver against the _story_, not the app: patch for typo and tuning fixes, minor
for added scenes or clues, major for a change that would invalidate an existing savegame. The
mechanics behind all of this are in
[§7.3](../docs/arc42/07-deployment-view.md#73-story-package-build-and-release).

## Known format gaps

Things a story may need that the package format has no field for yet — content the LLM or the UI
currently has to improvise, not bugs in the packages. They are tracked in
[`docs/arc42` §11.1](../docs/arc42/11-risks-and-technical-debt.md#111-open-gaps-in-the-content-format):
world files beyond clues/facts/secrets, prompt and safety rule files, package update strategy, and
the fact that only a group scene can set a flag mid-scene without ending it.
