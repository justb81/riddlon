# Design reference

`riddlon-app-mockup.dc.html` (+ `support.js`) is the Claude Design prototype for the Player PWA,
covering every planned screen with real interaction states and German copy: splash/boot (first-run
model download vs. warm start), chat overview, 1:1 + group conversation (including the
contradiction/clue-flag UI), the "Riddlon" system chat (library, ZIP/URL import), the story
overview / case-file screen (milestones, badges), settings/profile (pronoun picker with live
preview, the "Spielgefühl" disguise-level setting, local model picker), toasts, and the full-screen
case-solved celebration. It's built against the reference story from `docs/concept.md` §7 ("Lucys
Portmonnaie").

Read `riddlon-app-mockup.dc.html` directly for exact copy, layout and interaction states — it's a
static reference, not meant to be run standalone (it depends on Claude Design's `support.js`
runtime and a React global). Recreate the visuals in Svelte; don't port the prototype's DOM
structure.

Key visual rule stated in the mockup itself: the rust/terracotta accent (`#c1502e`) is used
**exclusively** for progress, contradictions and achievements — everything else in the app is
navy (`#151a26`) and cream (`#f3eee3`), so "something is rust-colored" always means "this is a game
signal, not just chat". Typography: DM Sans (UI), IBM Plex Mono (labels/timestamps/system text),
Instrument Serif (splash wordmark + celebration headline).
