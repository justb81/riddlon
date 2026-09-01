# Lucys Portmonnaie

The reference story from [`docs/arc42` §1.3](../../docs/arc42/01-introduction-and-goals.md#13-reference-story--lucys-portmonnaie-lucys-wallet),
and the fixture the MVP is validated against. Lucy's wallet is stolen at a club; the player questions
two witnesses whose accounts contradict each other, a delayed tip re-opens the case, and a group
confrontation resolves it.

Authoring notes for this one package — not packed into the released zip. For how to write, playtest
and release a package see the authoring guide at [`stories/README.md`](../README.md); for the format
itself and the build mechanics see
[`docs/arc42` §8.1](../../docs/arc42/08-crosscutting-concepts.md#81-content-package-format) and
[§7.3](../../docs/arc42/07-deployment-view.md#73-story-package-build-and-release).

## Cast

| Character | UUID                                   | Role in story                                                        |
| --------- | -------------------------------------- | -------------------------------------------------------------------- |
| Lucy      | `3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f` | Quest-giver; visible from the first message                          |
| Max       | `8b6d2f10-4c3a-4a91-9e2b-2f4a6b8c1d3e` | Witness and culprit; unlocked by `flag:witnesses-named`              |
| Sabine    | `c1a4e7f2-9d3b-4f6a-8e1c-5b7d9f0a2c4e` | Witness; unlocked by `flag:witnesses-named`                          |
| Hans      | —                                      | **Offscreen**: no character file, only a source Lucy quotes (step 9) |

These three UUIDs are the ones the format documentation uses in its own examples, so a future story
casting the same characters resolves against the same library entries.

## Walkthrough → graph

All fifteen steps of the reference story, and the scene each one runs in:

| Steps | Scene                   | Node id                                | Exits on                                  |
| ----- | ----------------------- | -------------------------------------- | ----------------------------------------- |
| 1–3   | Unbekannter Erstkontakt | `ce658bbf-33df-48d6-a2f6-e1568566fb8e` | `flag:lucy-identified`                    |
| 4–5   | Lucy bittet um Hilfe    | `32e477b0-6721-47cb-867e-cc181ed7c72f` | `flag:witnesses-named`                    |
| 6–7   | Max befragen (1)        | `0974a346-476c-4222-976e-ee43854fc709` | `flag:max-questioned`                     |
| 6–7   | Sabine befragen (1)     | `8e888a69-8631-40d8-af8d-a397d544ad20` | `flag:sabine-questioned`                  |
| 8     | Bericht an Lucy (1)     | `45fd7837-17ae-4ebe-b6fe-407779be1d79` | `flag:report-to-lucy-done`                |
| 9     | Lucys neuer Verdacht    | `b35e409f-d012-41ae-a655-8693901c086d` | `flag:suspicion-relayed`                  |
| 10    | Max befragen (2)        | `725e3554-0a53-49fa-9bb5-f80929dc685b` | `flag:max-denies-hans-claim`              |
| 10    | Sabine befragen (2)     | `107ad6e6-72d9-4039-a2c1-34e79113d7f5` | `flag:sabine-confirms-hans-claim`         |
| 11    | Bericht an Lucy (2)     | `8bc89ff8-3769-421f-8737-a80a2525c2c0` | `flag:hans-info-confirmed`                |
| 12–15 | Gruppen-Konfrontation   | `2c608d80-cbf4-44cc-bc62-d3f449616ccd` | Never — resolves via its outcomes instead |

`src/lib/engine/engine.spec.ts` plays exactly this sequence against the shipped JSON, and
`walkthrough.json` replays it through `npm run story:playtest`.

## The two endings

The group confrontation carries both, each with its own authored closing text:

| Outcome                 | Condition                 | Tone      | Reached when                                                               |
| ----------------------- | ------------------------- | --------- | -------------------------------------------------------------------------- |
| `max-confesses`         | `flag:evidence-presented` | `success` | The player lays out the contradictions and Max admits it                   |
| `false-accusation-made` | `flag:false-accusation`   | `setback` | The player names Sabine (or anyone else) instead of following the evidence |

Both are reachable **in the app**, not only from a playtest script: a group scene ships no
`exitConditions` on purpose, and the director may only set flags the scene declares — so its outcome
conditions are its settable-flag surface (`llm/director.ts`'s `settableFlags`). The suggestion chip
"Sabine, ich glaube, du warst es." is the authored way into the setback, and the scene's second goal
`defend-whoever-is-wrongly-accused` is what makes the cast push back instead of playing along.

Reaching the setback does not end the story: the player can still present the real evidence
afterwards and reach `max-confesses` — they simply no longer earn "Ohne Falschbeschuldigung gelöst".
`walkthrough-false-accusation.json` is that run, and
`src/lib/engine/engine.spec.ts` asserts both branches.

## Achievements

| Achievement                     | Conditions                                                    |
| ------------------------------- | ------------------------------------------------------------- |
| Fall gelöst                     | `outcome-reached:max-confesses`                               |
| Alle Hinweise gefunden          | One `clue-known:` per clue in `world/clues.json` — all six    |
| Ohne Falschbeschuldigung gelöst | `outcome-reached:max-confesses` + `not:flag:false-accusation` |

The playtest prints how many were earned, so an achievement whose conditions can never all hold
shows up as "never earned" rather than as a promise the story silently breaks.

## Seed chats

Max's and Sabine's first questioning scenes each carry a short authored history — the three of you
arranging the Saturday night at the Kellerlicht, days before the theft. It is why the player's answer
to Lucy's opening question ("Warst du letzten Samstag im Club?") has a past, and it is what stops
both threads looking freshly minted the moment `flag:witnesses-named` unlocks them.

Offsets are relative (`P5D`, `P2D`), so the history is always a few days old rather than dated to
whenever this package was authored.

## The mechanics this story exists to exercise

- **Evidence gate** — "Bericht an Lucy (1)" needs both witnesses questioned _and_
  `clue-confirmed:clue:time-window:2`, i.e. two independent sources on the same clue. One witness
  alone is not enough to advance.
- **Two contradictions**, both marked `conflicting: true`: `clue:time-window` (Max says ~22:00,
  Sabine says ~midnight) and `clue:max-whereabouts` (Max denies being at the cloakroom, Sabine puts
  him there). Every other clue corroborates.
- **The ~2 h delayed event** — `event:lucy-followup` arms when `flag:report-to-lucy-done` is set and
  unlocks "Lucys neuer Verdacht". That scene's `entryConditions` name a flag nothing ever sets
  (`flag:lucy-suspicion-only-via-delayed-event`), which is the point: an empty condition list would
  unlock it at story start, so the sentinel makes the delayed event the only way in.
- **Group chat** as its own scene type, with `playerRole: confront-max-with-evidence` and the
  `max-confesses` outcome gated on `flag:evidence-presented`.
- **Facts are the only way a character learns anything.** The persona prompt shows a character exactly
  the facts their own `knowledge.publicFacts` lists, so a fact no binding claims never reaches the
  model. All three know `fact:lucy-max-sabine-are-friends` — without it Lucy cannot carry out her own
  goal `name-max-and-sabine-as-witnesses`, because nothing would tell her Max and Sabine exist. Both
  witnesses additionally know `fact:cloakroom-unstaffed`, which is what lets them place the jacket
  (`clue:location`) instead of inventing a coat check. `src/lib/content/story-packages.spec.ts` fails
  on a fact nobody knows.
- **Goal order is prompt order.** The opening instruction repeats a scene's _first_ goal, so the
  opener actually opens the scene. `ask-whether-player-was-at-the-club` therefore comes first in
  "Unbekannter Erstkontakt" — literally step 1's „Warst du letzten Samstag im Club?" —
  because `open-as-unknown-contact` alone produced small talk.
- **Cold versus auto-open contacts.** Lucy's unknown-contact opener auto-opens on the schema default.
  Max's and Sabine's first questioning scenes ship `autoOpen: false`, so unlocking them via
  `flag:witnesses-named` does not have both proactively message the player with their seed goals —
  the player has to write first, same goals, no longer front-loaded. Together with the seed chats
  above, that is step 6 as written: a contact arrives with history, and waits.
- **Secrets unlock progressively**: `secret:hans-tip` (Lucy, after the first report),
  `secret:sabine-saw-max` (Sabine, once the suspicion is relayed), `secret:max-took-wallet` (Max, only
  once confronted with evidence — step 14's confession).

## Flags the engine expects a caller to set

The engine never invents flags; the director sets them as the conversation reaches each beat:

`flag:lucy-identified`, `flag:witnesses-named`, `flag:max-questioned`, `flag:sabine-questioned`,
`flag:report-to-lucy-done`, `flag:suspicion-relayed`, `flag:max-denies-hans-claim`,
`flag:sabine-confirms-hans-claim`, `flag:hans-info-confirmed`, `flag:evidence-presented`, and
`flag:false-accusation` (set when the player accuses someone wrongly — drives the
`false-accusation-made` outcome and, later, the "Ohne Falschbeschuldigung gelöst" achievement).

`flag:false-accusation` is settable only in the group confrontation, because that is the one scene
whose outcomes name it — see "The two endings" above.

`flag:lucy-nudge-due` is set _by_ the engine, via `event:lucy-nudge` (step 2). That event is
conditioned on `not:flag:lucy-identified` and dropped if the condition no longer holds when it comes
due, so it means what step 2 asks for — "nudge the player if they haven't answered" — rather than
merely "the nudge window has elapsed".

## Assets

`assets/` holds placeholder SVGs (cover plus three avatars) — this package is scoped as a
content/data-modelling exercise, not an art task.
