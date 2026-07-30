# Riddlon

An open-source platform for interactive chat stories: players chat with characters and the
plot unfolds through the conversation, while the app looks and feels like an ordinary messenger.
Riddlon is **offline-first** — after a story package is installed, it's fully playable without a
network connection, including local LLM inference in the browser.

This repository is the **Player PWA**, built on a client-only Progressive Web App base
(SvelteKit + Svelte 5 + Tailwind 4). It ships with the toolchain, PWA plumbing, and CI already
wired together, so the app starts from a green build instead of a blank folder. See
[`CLAUDE.md`](./CLAUDE.md) for the concept and architecture, and the repo's issues for the
build roadmap.

## Stack

- **[SvelteKit](https://svelte.dev/docs/kit)** + **[Svelte 5](https://svelte.dev/docs/svelte)** (forced runes mode)
- **[Tailwind CSS 4](https://tailwindcss.com)** with `@tailwindcss/forms` and semantic design tokens
- **[adapter-static](https://svelte.dev/docs/kit/adapter-static)** — a fully client-only, prerendered site (no server)
- **[Vitest](https://vitest.dev)** for unit tests, **ESLint** + **Prettier** for lint/format
- **TypeScript** throughout

## What's included

- **Installable PWA** — web manifest, standalone display, maskable icons, `theme-color`.
- **Offline support** — a cache-first service worker (`src/service-worker.ts`) that precaches
  the app shell, with an **opt-in update banner** (`$lib/state/update.svelte.ts`) instead of a
  silent mid-session takeover.
- **App-wide toasts** — `$lib/state/toast.svelte.ts` + `Toast.svelte`.
- **Window Controls Overlay** support for installed desktop apps (`$lib/state/windowChrome.svelte.ts`).
- **Semantic design tokens** — color / type / radius aliases onto Tailwind's palette in `layout.css`.
- **CI/CD** (already present under `.github/`) — lint/check/test/build on every PR, Dependabot,
  release-please, and deploy-to-GitHub-Pages on release.
- **Editor + agent config** — `.vscode/` recommended extensions and a `.claude/` + `CLAUDE.md` for
  working in the repo with [Claude Code](https://claude.com/claude-code).

## Quick start

```bash
npm install      # install dependencies
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # produce the static site in build/
npm run preview  # serve the production build locally
```

Requires Node 22+ (CI runs on Node 26).

## Project structure

```
src/
  app.html                  # HTML shell: manifest link, theme-color, viewport, Google Fonts
  app.d.ts                  # ambient types (incl. Window Controls Overlay)
  service-worker.ts         # cache-first offline precache + update handshake
  routes/
    +layout.svelte          # SW registration, update banner, global toast/achievement/celebration overlays
    +layout.ts              # ssr = false, prerender = true (client-only static)
    +page.svelte            # splash screen + first-run/warm boot sequence → /chats
    layout.css              # Tailwind import + semantic design tokens + shared keyframes
    chats/+page.svelte      # chat overview / thread list
    chat/[thread]/+page.svelte  # solo ("lucy") + group ("group") conversation, shared shell
    chat/riddlon/+page.svelte   # "Riddlon" system chat: installed-story library + import
    story/+page.svelte      # Storyübersicht: milestone timeline + achievements
    settings/+page.svelte   # profile & settings
  lib/
    components/
      chat/                 # AppHeader, InfoBand, MessageBubble, Composer, Avatar, ThreadRow, …
      icons/RiddlonMark.svelte
      ui/Toast.svelte
    state/                  # Svelte 5 runes singletons (browser-guarded)
      game.svelte.ts        #   active story session: messages, milestones, achievements
      profile.svelte.ts     #   player profile & settings (pronouns, disguise mode, model, …)
      toast.svelte.ts       #   transient notifications
      update.svelte.ts      #   service-worker update detection
      windowChrome.svelte.ts#   Window Controls Overlay state
      onboarding.ts         #   first-run vs. warm-boot detection (localStorage)
    story/                  # mock installed-story-package content ("Lucys Portmonnaie")
    i18n/                   # de.json dictionary + t() lookup — see CLAUDE.md "i18n"
static/                     # manifest.webmanifest, icons, robots.txt
stories/                    # authored story packages — built & released separately, see stories/README.md
scripts/build-stories.mjs   # validates + packs stories/ into dist/stories/*.zip
.github/                    # CI, Dependabot, release-please, GitHub Pages deploy, story releases
```

## Commands

| Task             | Command                                         |
| ---------------- | ----------------------------------------------- |
| Dev server       | `npm run dev`                                   |
| Production build | `npm run build` → static site in `build/`       |
| Preview build    | `npm run preview`                               |
| Type-check       | `npm run check`                                 |
| Unit tests       | `npm test` (once) / `npm run test:unit` (watch) |
| Lint             | `npm run lint`                                  |
| Format           | `npm run format`                                |
| Validate stories | `npm run stories:validate`                      |
| Pack stories     | `npm run stories:build` → `dist/stories/*.zip`  |

Tests run under Vitest's `server` (Node) project, which matches `src/**/*.{test,spec}.{js,ts}`
(not `*.svelte.{test,spec}.*`). `requireAssertions` is on — every test must assert at least once.

## Status

The chat UI (splash/boot, chat overview, solo + group chat, the Riddlon system/library chat, story
overview, profile/settings) is implemented end-to-end against scripted mock data for the reference
story "Lucys Portmonnaie". The real story engine, story-package import, character library, and
local-LLM module described in `CLAUDE.md` are not implemented yet — all game/session state above is
in-memory only and resets on reload. See `CLAUDE.md`'s "Project" table for what's mocked vs. real,
and the repo's issues for the build roadmap.

### GitHub Pages / release flow

The deploy workflow builds with `BASE_PATH` set to the repo's Pages subpath and publishes on
each GitHub Release. release-please raises the version/changelog PR from
[Conventional Commits](https://www.conventionalcommits.org); merging it tags a release, which
triggers the deploy. The release-please workflow expects a `RELEASE_TOKEN` repository secret (a PAT)
so the created release can trigger the deploy workflow — see the comment in
`.github/workflows/release-please.yml`. Enable **Settings → Pages → Source: GitHub Actions** in the
new repo before the first release.

### Story releases

Story packages under [`stories/`](./stories/) version and ship independently of the app.
`.github/workflows/stories.yml` validates them on every PR and, on `main`, publishes a GitHub
release per package version — tagged `story-<slug>-v<version>` with the `.zip` and its `.sha256`
attached. Bumping `version` in a story's `manifest.json` and merging is the whole procedure; the
deploy workflow ignores `story-*` tags so a content release doesn't redeploy the site.

## Conventions & gotchas

- **There is no `svelte.config.js`.** SvelteKit config (the static adapter and the forced-runes
  `compilerOptions`) lives inside the `sveltekit()` call in `vite.config.ts`.
- **Runes are forced on** for all app code. Use `$state` / `$derived` / `$props`; stores are plain
  classes in `.svelte.ts` files exported as singletons.
- **Relative imports use explicit `.js` extensions** (tsconfig `rewriteRelativeImportExtensions`).
  Use the `$lib` alias for `src/lib`.
- **Nothing touching the DOM may run at module top-level during SSR/prerender.** Guard with
  `browser` from `$app/environment` and feature-detect optional browser APIs.

## License

See [`LICENSE`](./LICENSE).
