# 12. Glossary

## 12.1 Domain and Technical Terms

| Term                        | Definition                                                                                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Achievement**             | An optional, named accomplishment declared by a package, earned when its `conditions` hold (AND semantics). Sticky: awarded once per playthrough and never revoked.                                            |
| **Authoring Studio**        | The planned, separate web application for authoring stories and exporting packages. Not part of this repository.                                                                                               |
| **Cast binding**            | The per-story role overlay on a character: role, knowledge, availability, relationships, identity mask. Lives in `story/story.json`.                                                                           |
| **Character identity**      | The global, story-independent description of a character (name, voice, personality), identified by a stable UUIDv4 and reusable across stories.                                                                |
| **Clue**                    | A single hint, possibly claimed differently by different sources. Carries a label; may be marked `conflicting`.                                                                                                |
| **Seed chat**               | Authored thread history shipped with a package and written into the savegame when a playthrough starts, so a newly unlocked contact does not open on an empty thread.                                          |
| **Condition**               | A colon-segmented predicate from the shared vocabulary in [§8.1.9](./08-crosscutting-concepts.md#819-condition-and-action-vocabulary).                                                                         |
| **Content package**         | A ZIP archive containing one complete story: manifest, story, graph, characters, world, assets. The only way content enters the app.                                                                           |
| **Delayed event**           | A persisted due-date that fires an action once its `approxDelay` has elapsed since arming. Approximate by contract.                                                                                            |
| **Director**                | The second, short model call after each reply that judges the scene's exit conditions and claimed revealables. The only thing that advances the graph.                                                         |
| **Disguise mode**           | _(Spielgefühl)_ An app setting controlling how much game-like chrome is shown: `pure`, `subtle`, `game`.                                                                                                       |
| **Effect** (`EngineEffect`) | A single state mutation reported by the engine — the sole contract between the engine and everything else.                                                                                                     |
| **Evidence gate**           | A condition requiring `n` independent sources to have claimed a clue (`clue-confirmed:<id>:<n>`) before progress is allowed.                                                                                   |
| **Fact**                    | An immutable canon truth the model must never contradict. Carries a full statement, no sources.                                                                                                                |
| **Flag**                    | A boolean story variable, keyed by its full symbolic ref (`flag:max-questioned`). Set by the director or by an action, never invented by the engine.                                                           |
| **Identity mask**           | A cast-binding field that shows a placeholder name (e.g. "Unbekannt") until its reveal condition holds.                                                                                                        |
| **Meta panel**              | An inline card inside a chat for a technical step — file picking, progress, conflict, error.                                                                                                                   |
| **Outcome**                 | A named ending of a group-chat scene, reached when its condition holds, with authored `label`/`closingText` and a `tone` saying whether it is a win or a setback.                                              |
| **Player PWA**              | The end-user application — this repository.                                                                                                                                                                    |
| **Prompt API**              | The W3C / Chrome browser API (`LanguageModel.availability()` / `create()` / `promptStreaming()`) that Riddlon adopts as its internal LLM interface.                                                            |
| **Revealable**              | A clue or fact ref a scene is allowed to reveal. Doubles as the director's allowlist.                                                                                                                          |
| **Scene**                   | A node in the story graph: participants, goals, entry/exit conditions, revealables, and either transitions (`chat-scene`) or a player role and outcomes (`group-chat-scene`).                                  |
| **Secret**                  | Knowledge a character withholds until its reveal condition holds. Carries a full statement, not just a label.                                                                                                  |
| **Seed chat**               | Pre-generated conversation history a newly unlocked contact should arrive with. Not expressible in the format yet.                                                                                             |
| **Story bundle**            | A validated package assembled into the shape the engine consumes: manifest, story, graph, clues, facts, secrets.                                                                                               |
| **System contact**          | The neutral, non-fictional contact ("Riddlon") through which import and library management run, kept separate from story characters. See [§8.7](./08-crosscutting-concepts.md#87-ui-layout-and-design-system). |
| **Symbolic ref**            | A colon-segmented content tag (`flag:…`, `clue:…`, `secret:…`, `event:…`), as opposed to a UUID. See [§8.1.1](./08-crosscutting-concepts.md#811-identifier-conventions).                                       |
| **Thread**                  | One conversation in the UI. A solo thread folds every scene with the same character into one chat; each unlocked group scene gets its own.                                                                     |

## 12.2 German UI Vocabulary

The UI is German; these terms appear in code, copy and design references.

| German             | Meaning in this app                                                           |
| ------------------ | ----------------------------------------------------------------------------- |
| **Fallakte**       | "Case file" — the wording on the case-solved celebration's button to `/story` |
| **Frisch starten** | The two reset actions in settings                                             |
| **Spielgefühl**    | The disguise-mode setting                                                     |
| **Storyübersicht** | The story overview screen (`/story`)                                          |
| **Unbekannt**      | The masked display name of a not-yet-identified contact                       |
