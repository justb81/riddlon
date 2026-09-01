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
characters made visible, outcomes reached, delayed events armed and fired — so an orphaned scene or a
dead flag shows up as "never unlocked" instead of shipping invisibly. An incomplete walkthrough does
not fail the run: it only covers the branches it scripts.
See [`lucys-portmonnaie/walkthrough.json`](./lucys-portmonnaie/walkthrough.json) for a worked example
covering all fifteen steps of the reference story.

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
seed chats, achievement conditions, delayed events re-checking their condition, prompt/safety rule
files, and package update strategy.
