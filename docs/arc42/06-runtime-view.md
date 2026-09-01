# 6. Runtime View

## 6.1 Boot and First Run

`/` is the splash screen. Its progress bar is derived from real state, not from timers.

```mermaid
sequenceDiagram
    participant P as Player
    participant Boot as / (splash)
    participant Llm as llm singleton
    participant Rt as storyRuntime
    participant DB as IndexedDB

    P->>Boot: opens the app
    Boot->>Llm: probe capabilities (WebGPU, buffer limits, connection)
    alt native Prompt API present
        Llm-->>Boot: ready, no download
    else WebLLM usable
        opt metered connection
            Boot->>P: ask before spending ~1.9 GB
        end
        Llm->>Llm: download + compile weights (one 0..1 fraction)
        Llm-->>Boot: progress updates
    else no local model and a Gemini key is stored
        Llm-->>Boot: ready via Gemini
    else
        Llm-->>Boot: unsupported — the app still runs, threads explain why they are empty
    end
    Boot->>Rt: init()
    Rt->>DB: read installed packages + active package pointer
    Rt->>Rt: activate the first package that yields a loadable bundle, resume its save
    Boot->>P: navigate to /chats
```

Boot phases are `consent → checking → model-load → library-load → done | error`
(`story/boot-steps.ts`). The `loadingModel → preparingDevice` label switch is a threshold heuristic
at 85 % of the load fraction: the backend collapses download and shader compilation into one
fraction, so there is no real phase boundary to read.

A fresh device therefore reaches `/chats` with **an empty chat list** — nothing is auto-installed;
the "Riddlon" system chat is the only row until a package is imported.

## 6.2 Installing a Story Package

Both import paths converge on the same installer. There is no privileged install route: the bundled
example under `static/stories/` is installed through the very same URL importer a player would use
for a third-party package.

```mermaid
sequenceDiagram
    participant P as Player
    participant Chat as /chat/riddlon
    participant Imp as zip-import / url-import
    participant Inst as install-package
    participant Val as validate-package
    participant Blob as Cache Storage
    participant Lib as character library
    participant Reg as story registry

    alt ZIP import
        P->>Chat: picks a .zip file
        Chat->>Imp: importPackageFromFile(file)
    else URL import
        P->>Chat: enters a URL (or picks a bundled entry)
        Chat->>Imp: importPackageFromUrl(url)
        Imp->>Imp: one-time HTTPS download
    end
    Imp->>Inst: installPackageFromZipBytes(bytes)
    Inst->>Inst: unzip (fflate)
    Inst->>Val: validate manifest, schemas, versions, references
    alt invalid
        Val-->>P: typed ImportError shown as a chat card
    else valid
        Inst->>Blob: store every asset content-addressed
        Inst->>Lib: resolve character UUIDs against the local library
        Inst->>Reg: register the package
        Reg-->>Chat: library updated, story playable offline
    end
```

The installer never throws; every failure mode is a distinguishable `ImportError`. After import the
story is fully local and independent of where it came from.

## 6.3 One Conversation Turn

This is the core loop. A player turn costs **two** decode passes: the character reply, then the
director verdict.

```mermaid
sequenceDiagram
    participant P as Player
    participant S as storySession
    participant Save as save store
    participant Llm as LlmSession (character)
    participant Dir as LlmSession (director)
    participant Eng as StoryEngine

    P->>S: send(threadKey, text)
    S->>Save: persist the player's message (kept even if no reply follows)
    S->>S: pickResponder() — who answers in a group chat
    S->>Llm: session(threadKey:speaker) with the persona prompt for this scene
    Llm-->>S: streamed reply
    S->>Save: persist the reply
    S->>Dir: director prompt — scene goals, exit conditions, revealables, transcript
    Dir-->>S: raw answer
    S->>S: parse + filter every id against what this scene declared
    S->>Eng: setFlag / recordClueClaim for what survived
    Eng-->>S: EngineEffect[] — scenes unlocked/completed, characters unlocked, conflicts, outcomes
    S->>P: updated thread, clue panels, contact list, celebration overlay
```

Details that matter:

- **The persona prompt is rebuilt on every turn.** A thread keeps one session per character for the
  whole story while the _scene_ driving their goals advances underneath it. `createSession(key,
config)` returns the existing session but adopts the new config, destroying and rebuilding the
  backend handle from replayed history. Skipping this made a character replay the goals of the
  scene they were first spoken to in, forever — and since only the director advances the graph, the
  story then stopped dead.
- **The director session is created with `maxHistoryTurns: 0` and destroyed after each call.** It
  must judge this exchange, not accumulate its own past verdicts.
- **The parser is paranoid.** Every id is checked against what the active scene declared, so a
  hallucinated answer can only ever mean "nothing happens", never "some other flag got set". Two
  near-miss shapes a small local model reliably produces — a bare flag id, and a character named by
  display name instead of UUID — are normalised _before_ the allowlist check, never after.
- **A broken stream keeps its partial output.** Whatever was generated before the break is persisted
  rather than dropped.
- **Without a loaded model a thread is empty and says so**, including a scene's opening line, because
  every message is generated. Opening a thread never starts a model download; that is the boot
  screen's decision.

## 6.4 Resume and Delayed Events

Delayed events are persisted due-dates, not timers.

```mermaid
sequenceDiagram
    participant P as Player
    participant R as resume hook
    participant Eng as StoryEngine
    participant Save as save store

    P->>R: opens / foregrounds the app
    R->>Eng: resume(now)
    Eng->>Eng: fire every armed event whose approxDelay has elapsed
    Eng->>Eng: recompute graph, arm newly eligible events
    Eng-->>Save: persist state
    Eng-->>P: unlocked scenes / contacts appear
```

Firing is sticky — a fired event never fires twice. An engine's very first construction is itself a
resume: it unlocks scenes with no entry conditions and arms already-eligible events.

## 6.5 Application Update

A newly installed service worker deliberately sits in the `waiting` state instead of calling
`skipWaiting()` itself, so the open page keeps running the version it loaded.

```mermaid
sequenceDiagram
    participant SW as new service worker
    participant U as updateStatus
    participant P as Player

    SW->>SW: install, precache, stay "waiting"
    U->>U: detect the waiting worker → available = true
    U->>P: show the reload banner
    P->>U: clicks reload
    U->>SW: postMessage SKIP_WAITING
    SW->>SW: skipWaiting(), activate, sweep only superseded shell caches
```

The activate sweep deletes only `riddlon-shell-*` caches. The asset blob store
(`riddlon-assets-v1`) and the multi-gigabyte model-weight cache are explicitly not swept.

## 6.6 Reset

Two actions behind `/settings`:

| Action                 | Clears                                                                                     | Keeps                                   |
| ---------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------- |
| `resetStoryProgress()` | Savegames                                                                                  | Installed packages, characters, profile |
| `resetEverything()`    | Packages, characters, saves, profile, settings, package assets, the active-package pointer | Downloaded model weights                |

Both end in a full page load, because the state singletons memoise their `init()`.

Model weights survive on purpose: `appKeysToClear()` keeps the `riddlon:llm:*` cache markers, so no
multi-gigabyte re-download is triggered by a factory reset. Two keys are carved out of that rule in
opposite directions — `riddlon:active-package` goes, so no pointer outlives the package the wipe
deleted, and the **Gemini API key goes too** despite sitting under the `riddlon:llm:` prefix: it is a
credential, not a cache, so "alles zurücksetzen" clears it like any other app key.
