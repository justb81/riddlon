# 10. Quality Requirements

## 10.1 Quality Tree

```
Riddlon
├── Offline capability      (top priority)
│   ├── Playable with the network switched off, inference included
│   ├── Installable and launchable from the home screen
│   └── An update never breaks a running session
├── Privacy
│   ├── No playthrough data leaves the device by default
│   └── Any cloud path is explicit, opt-in and visible
├── Content genericity
│   ├── A new story needs no app change
│   ├── The same validator runs in app, build and CI
│   └── A released package stays playable across app versions
├── Controlled dramaturgy
│   ├── Progress is decided by the engine, never by the model
│   └── A bad model answer stalls the story, never derails it
├── Usability
│   ├── The app reads as a messenger, on phone and desktop
│   └── Technical steps (import, download) are explicit, not hidden in fiction
└── Maintainability
    ├── Module boundaries are asserted by tests
    └── Logic is testable in Node, without a browser or GPU
```

## 10.2 Quality Scenarios

| #   | Scenario                                                                                                        | Expected response                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | The player installs the app and one story, then switches the device to flight mode and plays for an hour.       | Everything works: threads, replies, clues, progress, story overview. No request is attempted.                                     |
| Q2  | The player opens the app on a device with no WebGPU, no built-in model and no configured endpoint.              | The app boots, the library and settings work, and every thread states plainly why no message can be generated. Nothing crashes.   |
| Q3  | A new app version is deployed while a player has the app open mid-conversation.                                 | The running session continues on the loaded version. A banner offers a reload; nothing changes until the player accepts.          |
| Q4  | An author edits a released story and merges without bumping `version`.                                          | The story workflow's checksum comparison fails the build with "bump the version". Nothing is republished silently.                |
| Q5  | A package declares a scene condition flag that nothing ever sets.                                               | Validation passes (it is structurally valid), but `story:playtest` reports the scene as never unlocked, before release.           |
| Q6  | The director model returns prose containing an invented flag id and a character named "Lucy" instead of a UUID. | The display name is normalised to the UUID; the invented flag is dropped by the per-scene allowlist. Worst case: nothing happens. |
| Q7  | A player imports a package built for a newer format major.                                                      | Import fails with `UNSUPPORTED_FORMAT_VERSION` shown as a chat card. Nothing is written to storage.                               |
| Q8  | Two independently authored stories cast the same character UUID.                                                | The local library recognises the character on import and links to the existing entry rather than creating a duplicate identity.   |
| Q9  | A player on a metered connection boots for the first time.                                                      | The ~1.9 GB download is not started automatically; the boot screen asks first.                                                    |
| Q10 | The player resets everything from settings.                                                                     | Packages, characters, saves, profile, settings and assets are gone after a full reload. Downloaded model weights are still there. |
| Q11 | A generation stream breaks halfway through a reply.                                                             | Whatever was generated is persisted rather than dropped, an error code is surfaced, and the thread stays usable.                  |
| Q12 | A developer adds an import of `@mlc-ai/web-llm` outside `src/lib/llm/`, or of `llm/` inside `engine/`.          | `npm test` fails on the boundary spec.                                                                                            |
