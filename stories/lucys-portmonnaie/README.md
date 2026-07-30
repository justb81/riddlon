# Lucys Portmonnaie

The reference story from [`docs/concept.md`](../../docs/concept.md) §7, and the fixture the
MVP is validated against (issue #19). Lucy's wallet is stolen at a club; the player questions
two witnesses whose accounts contradict each other, a delayed tip re-opens the case, and a
group confrontation resolves it.

Authoring notes only — this file is not packed into the released zip.

## Cast

| Character | UUID                                   | Role in story                                                       |
| --------- | -------------------------------------- | ------------------------------------------------------------------- |
| Lucy      | `3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f` | quest-giver; visible from the first message                         |
| Max       | `8b6d2f10-4c3a-4a91-9e2b-2f4a6b8c1d3e` | witness and culprit; unlocked by `flag:witnesses-named`             |
| Sabine    | `c1a4e7f2-9d3b-4f6a-8e1c-5b7d9f0a2c4e` | witness; unlocked by `flag:witnesses-named`                         |
| Hans      | —                                      | **offscreen**: no character file, only a source Lucy quotes (§7 §9) |

Lucy/Max/Sabine reuse the UUIDs `docs/concept.md` §5.1/§5.3 assigns them, so a future story
that casts the same three characters resolves against the same library entries.

## Walkthrough → graph

All 15 steps of §7, and the scene each one runs in:

| §7 steps | Scene                   | Node id                                | Exits on                                                 |
| -------- | ----------------------- | -------------------------------------- | -------------------------------------------------------- |
| 1–3      | Unbekannter Erstkontakt | `ce658bbf-33df-48d6-a2f6-e1568566fb8e` | `flag:lucy-identified`                                   |
| 4–5      | Lucy bittet um Hilfe    | `32e477b0-6721-47cb-867e-cc181ed7c72f` | `flag:witnesses-named`                                   |
| 6–7      | Max befragen (1)        | `0974a346-476c-4222-976e-ee43854fc709` | `flag:max-questioned`                                    |
| 6–7      | Sabine befragen (1)     | `8e888a69-8631-40d8-af8d-a397d544ad20` | `flag:sabine-questioned`                                 |
| 8        | Bericht an Lucy (1)     | `45fd7837-17ae-4ebe-b6fe-407779be1d79` | `flag:report-to-lucy-done`                               |
| 9        | Lucys neuer Verdacht    | `b35e409f-d012-41ae-a655-8693901c086d` | `flag:suspicion-relayed`                                 |
| 10       | Max befragen (2)        | `725e3554-0a53-49fa-9bb5-f80929dc685b` | `flag:max-denies-hans-claim`                             |
| 10       | Sabine befragen (2)     | `107ad6e6-72d9-4039-a2c1-34e79113d7f5` | `flag:sabine-confirms-hans-claim`                        |
| 11       | Bericht an Lucy (2)     | `8bc89ff8-3769-421f-8737-a80a2525c2c0` | `flag:hans-info-confirmed`                               |
| 12–15    | Gruppen-Konfrontation   | `2c608d80-cbf4-44cc-bc62-d3f449616ccd` | never — resolves via the `max-confesses` outcome instead |

`src/lib/engine/engine.spec.ts` plays exactly this sequence against the shipped JSON.

## The mechanics this story exists to exercise

- **Evidence gate** (§7 step 7) — "Bericht an Lucy (1)" needs both witnesses questioned _and_
  `clue-confirmed:clue:time-window:2`, i.e. two independent sources on the same clue. One
  witness alone is not enough to advance.
- **Two contradictions**, the ones issue #19 names, both marked `conflicting: true`:
  `clue:time-window` (Max says ~22 Uhr, Sabine says ~Mitternacht) and `clue:max-whereabouts`
  (Max denies being at the cloakroom, Sabine puts him there). Every other clue is corroborating.
- **The ~2h delayed event** — `event:lucy-followup` arms when `flag:report-to-lucy-done` is set
  and unlocks Lucys neuer Verdacht. That scene's `entryConditions` name a flag nothing ever
  sets (`flag:lucy-suspicion-only-via-delayed-event`), which is the point: an empty condition
  list would unlock it at story start, so the sentinel makes the delayed event the _only_ way in.
- **Group chat** as its own scene type, with `playerRole: confront-max-with-evidence` and the
  `max-confesses` outcome gated on `flag:evidence-presented`.
- **Facts as the only way a character learns anything.** `buildPersonaPrompt` shows a character
  exactly the facts their own `knowledge.publicFacts` lists, so a fact no binding claims never
  reaches the model. All three know `fact:lucy-max-sabine-are-friends` — without it Lucy cannot
  carry out her own scene goal `name-max-and-sabine-as-witnesses`, because nothing would tell her
  Max and Sabine exist. Both witnesses additionally know `fact:cloakroom-unstaffed`, which is what
  lets them place the jacket (`clue:location`) instead of inventing a coat check.
  `src/lib/content/story-packages.spec.ts` fails on a fact nobody knows.
- **Goal order is prompt order.** `buildOpeningInstruction` repeats a scene's _first_ goal in the
  turn instruction, so the opener actually opens the scene. `ask-whether-player-was-at-the-club`
  therefore comes first in "Unbekannter Erstkontakt" — that is literally §7 step 1's
  „Warst du letzten Samstag im Club?", and `open-as-unknown-contact` alone produced small talk.
- **Cold vs. auto-open contacts.** Lucy's unknown-contact opener (`ce658bbf-...`) auto-opens on the
  schema default (`autoOpen` unset). Max's and Sabine's first questioning scenes
  (`0974a346-.../8e888a69-...`) ship `autoOpen: false`, so unlocking them via
  `flag:witnesses-named` no longer has both proactively message the player with their
  `seed-timeline`/`seed-location`/`seed-suspect-description` goals — the player has to write to
  them first, same goals, no longer front-loaded. This is a narrower fix than what §7 step 6 and
  issue #30 ("Seed chats", `stories/README.md`) actually call for — Max and Sabine arriving with
  pre-authored history instead of an empty thread — so that gap stays open.
- **Secrets** unlock progressively: `secret:hans-tip` (Lucy, after the first report),
  `secret:sabine-saw-max` (Sabine, once the suspicion is relayed), `secret:max-took-wallet`
  (Max, only once confronted with evidence — step 14's confession).

## Flags the engine expects a caller to set

The engine never invents flags; `ui/`+`llm/` set them as the conversation reaches each beat:

`flag:lucy-identified`, `flag:witnesses-named`, `flag:max-questioned`, `flag:sabine-questioned`,
`flag:report-to-lucy-done`, `flag:suspicion-relayed`, `flag:max-denies-hans-claim`,
`flag:sabine-confirms-hans-claim`, `flag:hans-info-confirmed`, `flag:evidence-presented`, and
`flag:false-accusation` (set when the player accuses someone wrongly — drives the
`false-accusation-made` outcome and, later, the "Ohne Falschbeschuldigung gelöst" achievement).

`flag:lucy-nudge-due` is set _by_ the engine, via `event:lucy-nudge` (§7 step 2).

## Assets

`assets/` holds placeholder SVGs (cover + three avatars) — issue #19 explicitly scopes this as
a content/data-modeling task, not an art task.
