# 4. Solution Strategy

## 4.1 Quality Goals to Approach

How each quality goal from [§1.2](./01-introduction-and-goals.md#12-quality-goals) is achieved, and
where to read the detail.

| Quality goal              | Approach                                                                                                                                                                                                                                        | Detail                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Offline capability**    | A prerendered static shell precached by a cache-first service worker; story packages fully unpacked into IndexedDB and Cache Storage on import; model weights cached by the inference backend. No feature calls a server at play time.          | [§8.6](./08-crosscutting-concepts.md#86-offline-and-pwa-behaviour)                                                   |
| **Privacy / no cloud**    | Inference resolves _native browser model → WebLLM on WebGPU → Gemini BYOK_, in that order. No cloud SDK is a dependency at all; the one cloud path is an opt-in, player-keyed `fetch`.                                                          | [§8.4](./08-crosscutting-concepts.md#84-local-llm-inference)                                                         |
| **Content genericity**    | One documented package format; a validator/loader that is the same code in the app, in the build script and in CI; the app itself ships zero authored content and installs even the bundled example through the public URL importer.            | [§8.1](./08-crosscutting-concepts.md#81-content-package-format)                                                      |
| **Controlled dramaturgy** | A deterministic `StoryEngine` over a scene graph owns all progress. It has no dependency on the LLM. A separate, short **director** model pass translates free conversation into the symbols the scene declared, filtered against an allowlist. | [§8.3](./08-crosscutting-concepts.md#83-story-engine), [§8.4.4](./08-crosscutting-concepts.md#844-the-director-pass) |
| **Chat-first UX**         | Seven screens, each a real route so back/forward and reload behave like a normal web app. Even library management and package import are a chat thread ("Riddlon"), with explicit UI cards for file picking and progress.                       | [§8.7](./08-crosscutting-concepts.md#87-ui-layout-and-design-system)                                                 |

## 4.2 Structural Decisions That Follow

1. **Module boundaries are enforced by tests, not conventions.** `engine/` must not import `llm/`;
   nothing outside `llm/` may import `@mlc-ai/web-llm`. Both are asserted by specs, which is what
   keeps "swap the model" and "swap the story" configuration changes rather than refactors.
2. **The Prompt API _is_ the internal LLM interface.** Riddlon defines no backend vocabulary of its
   own; three providers implement the same shape, and exactly one file knows all three exist.
3. **Pure logic is separated from reactive state.** Framework-free logic sits in plain `.ts` files
   with Node tests; runes singletons in `.svelte.ts` are thin wrappers over them.
4. **Story content lives outside `src/`.** Packages are authored under `stories/`, validated with the
   app's own validator, and released on their own tag track.
5. **Everything about a playthrough is derived, never authored in app code.** Threads, contacts,
   chapters and clue panels are computed from the installed bundle plus engine state.
