# 1. Introduction and Goals

## 1.1 Requirements Overview

**Riddlon** is an open-source platform for **interactive chat stories**. The player converses with
fictional characters in what looks and behaves like an ordinary messenger; the plot unfolds through
that conversation. The platform is generic: no story is hard-coded, every story is an interchangeable
content package.

The product consists of two visible applications on top of one openly documented **content package
format**:

| Application          | Purpose                                                                              | Status                       |
| -------------------- | ------------------------------------------------------------------------------------ | ---------------------------- |
| **Player PWA**       | The end-user app: installs story packages and plays them, entirely client-side       | **This repository**          |
| **Authoring Studio** | Web authoring environment for stories, characters, world knowledge; exports packages | Not built yet, separate repo |

This repository documents the **Player PWA** only. Where a chapter refers to the Studio, it does so
to explain a boundary of the package format, not to specify the Studio itself.

Target genres for the first expansion stage are small crime stories and historical mysteries.
Riddlon deliberately does **not** connect to NSFW / adult roleplay ecosystems such as SillyTavern;
it positions itself as a serious, cleaner experience.

Core capabilities of the Player PWA:

- Install a story package from a local **ZIP file** or a **URL** (one-time download, then local).
- Play it **fully offline**, including AI inference in the browser.
- Run a **deterministic story engine** (scenes, flags, clues, delayed events, outcomes) that
  controls progress, while a local LLM produces the dialogue.
- Maintain a **local, story-independent character library** so a character recognised by UUID is
  shared across stories.
- Persist savegames, the story library and binary assets on the device.

## 1.2 Quality Goals

The five goals that shape the architecture, in priority order:

| #   | Quality goal                      | Motivation / scenario                                                                                                                                 |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Offline capability**            | After installation the app must be fully playable without a network connection, AI inference included. No feature may require a server round trip.    |
| 2   | **Privacy / no cloud dependency** | Local in-browser inference is the default mode. Nothing about a playthrough leaves the device unless the player explicitly configures a cloud key.    |
| 3   | **Content genericity**            | No story content is hard-coded. Any story, character or world can be authored and shipped as an interchangeable package without touching app code.    |
| 4   | **Controlled dramaturgy**         | The LLM produces lively dialogue, but a deterministic state graph — never the free-running model — decides progress, reveals and branching.           |
| 5   | **Chat-first UX**                 | The whole interaction, including system functions such as story import, uses the messenger metaphor, supplemented by explicit UI for technical steps. |

Two further principles are architecturally binding but not measurable as quality attributes:

- **Character reusability** — characters are standalone, story-independent entities identified by a
  stable UUID, so the same figure can appear in independently authored stories.
- **Serious genre positioning** — crime / historical / drama; no orientation toward adult content
  communities. This drives the decision against existing character-card standards
  (see [ADR 2](./09-architecture-decisions.md#adr-2-own-content-package-format)).

## 1.3 Reference Story — "Lucys Portmonnaie" (Lucy's Wallet)

One reference story validates that the data model is fit for purpose. It ships as
`stories/lucys-portmonnaie/` and is the fixture the engine's acceptance test plays through. Its
fifteen steps define the feature set the MVP must support:

1. An unknown contact writes to the player ("Were you at the club last Saturday?").
2. If the player does not react, an automatic follow-up adds information ("I'm Lucy").
3. The contact name changes automatically from "Unbekannt" to "Lucy".
4. Lucy asks for help: her wallet was stolen.
5. Lucy names Max and Sabine as possible witnesses.
6. Max and Sabine appear automatically as new contacts.
7. The player questions both; their accounts partly contradict each other (time, place, stolen
   items, description of the culprit) — both sources are needed for the full picture.
8. The player reports back to Lucy; afterwards Lucy goes quiet for a while.
9. After roughly two hours (an approximate delayed event) Lucy reappears with a new suspicion
   (Hans incriminates Max).
10. The player discusses the new suspicion with Max (denies) and Sabine (confirms).
11. The player reports to Lucy; the suspicion is confirmed.
12. A group chat with everyone involved opens.
13. Lucy confronts Max; the player must confront Max with the collected evidence.
14. Max confesses and promises to return the wallet.
15. Case solved, optionally with achievements.

The mechanics this story exists to exercise:

- unknown first contact with later identity reveal (`identityMask`)
- dynamic unlocking of new contacts
- multi-source clues with contradictions (clue conflicts)
- an evidence gate — progress only once enough independent sources confirm a clue
- an approximate, delayed story event
- group chat as its own scene type
- resolution with an optional achievement system
- character reuse across future, independent stories via stable UUIDs

The step-to-scene mapping and the flags each beat expects are documented with the package itself in
[`stories/lucys-portmonnaie/README.md`](../../stories/lucys-portmonnaie/README.md).

## 1.4 Stakeholders

| Role                 | Expectation                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Player**           | Installs the app, imports a story, plays offline on a phone or desktop browser; expects a messenger, not a game console. |
| **Story author**     | Authors a package against a stable, documented format and releases it independently of the app.                          |
| **App maintainer**   | Extends engine, UI and LLM module without breaking installed packages or savegames.                                      |
| **Content reviewer** | Needs to see, from the package alone, what a story can and cannot make the app do.                                       |
