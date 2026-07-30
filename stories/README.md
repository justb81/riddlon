# Story packages

Source form of the installable story packages this repo publishes. One directory here =
one package = one independently versioned GitHub release. The player app itself ships **no**
story content (`docs/concept.md` §2: "Kein Story-Inhalt ist hartkodiert") — a story arrives
through ZIP or URL import like any third-party package would.

| Package                                      | Story             | Status                                                                   |
| -------------------------------------------- | ----------------- | ------------------------------------------------------------------------ |
| [`lucys-portmonnaie/`](./lucys-portmonnaie/) | Lucys Portmonnaie | Reference story from `docs/concept.md` §7 — the MVP's end-to-end fixture |

## Layout

A package directory is the unzipped archive, byte for byte, minus the generated
`signatures/checksums.json`:

```
stories/<slug>/
├── manifest.json                       # docs/concept.md §5.2 — declares every other file
├── story/
│   ├── story.json                      # castBindings, achievements, delayedEvents (§5.3, §5.6)
│   └── graph.json                      # the scene state graph (§5.4, §5.7)
├── characters/<uuid>.character.json    # one per character identity (§5.3)
├── world/
│   ├── clues.json                      # (§5.5)
│   ├── facts.json
│   └── secrets.json
├── assets/{covers,avatars}/            # cover + avatar images
└── README.md                           # authoring notes — NOT packed into the zip
```

The manifest is the index: **a file the manifest doesn't declare is a file the player never
loads.** The build fails on undeclared `.json` content rather than shipping something inert.

`world/*.json` filenames are load-bearing — `validate-package.ts` picks the schema by suffix
(`clues.json` / `facts.json` / `secrets.json`). A world file with any other name validates
vacuously.

## Building

```bash
npm run stories:validate   # validate every package, write nothing
npm run stories:build      # validate + write dist/stories/<slug>-v<version>.zip
```

`scripts/build-stories.mjs` validates through the app's own
`src/lib/content/validate-package.ts` — the exact code path the player runs on import (#10),
so the build step and the runtime can't disagree about what a valid package is. On top of the
schema it checks what the schema can't: undeclared content files and character `avatar` paths
that don't resolve.

Archives are reproducible — fixed timestamps and sorted entries, so an unchanged story rebuilds
to a byte-identical zip with the same `sha256`. `signatures/checksums.json` (concept §5) is
generated per build over the packed files, so a stale copy can never ship.

`npm test` validates every package here too (`src/lib/content/story-packages.spec.ts`), so
broken content fails ordinary CI, not just the release workflow.

## Releasing

`.github/workflows/stories.yml` runs on every PR and every push to `main` that touches
`stories/**`. On `main` it publishes a GitHub release for each package whose version isn't
released yet:

- tag: `story-<slug>-v<version>` (e.g. `story-lucys-portmonnaie-v1.0.0`)
- assets: the `.zip` and its `.sha256`

So **bump `version` in `manifest.json` and merge to `main`** — that is the whole release
procedure. An unchanged version re-runs the build and publishes nothing. This is deliberately
independent of release-please, which versions the app (`v<x.y.z>`); `deploy.yml` skips
`story-*` tags so a content release never redeploys the site.

Story versions follow semver against the _story_, not the app: patch for typo/tuning fixes,
minor for added scenes or clues, major for a change that would invalidate an existing savegame.

## Adding a story

1. `mkdir stories/<slug>` and write the files above. `manifest.id` must be a fresh UUIDv4 —
   generate one, never copy another package's.
2. Character UUIDs are **stable and global** (concept §5.1/§5.3): reuse an existing character's
   UUID to have the player's library recognise them across stories, and mint a new one otherwise.
3. `npm run stories:validate` until clean, then open a PR. CI validates it; merging to `main`
   releases it.

## Known format gaps

Things the reference story needs but the package format (issue #4) has no field for yet. These
are content the LLM/UI currently has to improvise, not bugs in the packages:

- **Seed chats** (§7 step 6 — new contacts arrive with pre-generated history). No schema home;
  the scene's `goals` are the only hint the model gets.
- **Identity masking** (§7 steps 1–3 — a contact shows as "Unbekannt" until they introduce
  themselves). Modelled here as a scene plus `flag:lucy-identified`; the display-name swap
  itself is a UI concern with no package field behind it.
- **Achievement conditions**. `achievementSchema` is id/label/description only (an explicit
  open point in concept §9), so the three endings are declared but nothing evaluates when they
  are earned — that lands with #17.
- **Cancelling an armed delayed event.** `fireDueEvents` doesn't re-check the condition, so
  "nudge the player _if_ they haven't replied" can't be expressed. `event:lucy-nudge` therefore
  only means "the nudge window has elapsed"; whether to actually send one is left to the UI.
