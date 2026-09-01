# Riddlon

An open-source platform for **interactive chat stories**: players chat with characters and the plot
unfolds through the conversation, while the app looks and feels like an ordinary messenger. Riddlon
is **offline-first** — once a story package is installed it is fully playable without a network
connection, including local LLM inference in the browser.

This repository is the **Player PWA**: a client-only SvelteKit + Svelte 5 + Tailwind 4 app with no
backend. Story content is authored separately as interchangeable packages; the app itself ships no
story of its own.

## Documentation

All architecture documentation lives in **[`docs/arc42/`](./docs/arc42/)** and follows the
[arc42](https://arc42.org) template. Start with the
[chapter index](./docs/arc42/README.md).

| Looking for                             | Read                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| What the product is and why             | [§1 Introduction and Goals](./docs/arc42/01-introduction-and-goals.md)                            |
| How the modules fit together            | [§5 Building Block View](./docs/arc42/05-building-block-view.md)                                  |
| What happens during a conversation turn | [§6 Runtime View](./docs/arc42/06-runtime-view.md)                                                |
| The story-package format                | [§8.1 Content Package Format](./docs/arc42/08-crosscutting-concepts.md#81-content-package-format) |
| Why something is built the way it is    | [§9 Architecture Decisions](./docs/arc42/09-architecture-decisions.md)                            |
| Known gaps and accepted debt            | [§11 Risks and Technical Debt](./docs/arc42/11-risks-and-technical-debt.md)                       |

Contributors working with [Claude Code](https://claude.com/claude-code) should also read
[`CLAUDE.md`](./CLAUDE.md).

## Stack

- **[SvelteKit](https://svelte.dev/docs/kit)** + **[Svelte 5](https://svelte.dev/docs/svelte)** (forced runes mode)
- **[Tailwind CSS 4](https://tailwindcss.com)** with `@tailwindcss/forms` and semantic design tokens
- **[adapter-static](https://svelte.dev/docs/kit/adapter-static)** — a fully client-only, prerendered site
- **[@mlc-ai/web-llm](https://github.com/mlc-ai/web-llm)** for in-browser inference over WebGPU
- **[Zod](https://zod.dev)** for package validation, **[idb](https://github.com/jakearchibald/idb)** for storage, **[fflate](https://github.com/101arrowz/fflate)** for ZIP handling
- **[Vitest](https://vitest.dev)**, **ESLint**, **Prettier**, **TypeScript**

## Quick start

```bash
npm install      # requires Node 22+ (CI runs on Node 26)
npm run dev      # dev server on http://localhost:5173
npm run build    # static site in build/
npm run preview  # serve the production build locally
```

| Task               | Command                                         |
| ------------------ | ----------------------------------------------- |
| Type-check         | `npm run check`                                 |
| Unit tests         | `npm test` (once) / `npm run test:unit` (watch) |
| Lint / format      | `npm run lint` / `npm run format`               |
| Validate stories   | `npm run stories:validate`                      |
| Pack stories       | `npm run stories:build` → `dist/stories/*.zip`  |
| Bundle for the app | `npm run stories:bundle` → `static/stories/`    |
| Playtest a story   | `npm run story:playtest -- stories/<slug>`      |

## Repository layout

```
src/                  # the Player PWA — see docs/arc42 §5
stories/              # authored story packages — see stories/README.md and docs/arc42 §7.3
scripts/              # story validation, packing and playtest tooling
docs/arc42/           # the architecture documentation
docs/design/          # the Claude Design pixel reference — see docs/arc42 §8.7
static/               # manifest, icons, generated story bundles
.github/              # CI, Dependabot, release-please, Pages deploy, story releases
```

## Releases

The app versions via [Conventional Commits](https://www.conventionalcommits.org) and release-please,
and deploys to GitHub Pages on each release. Story packages version and ship on their own
`story-<slug>-v<version>` tags. Both flows are documented in
[§7 Deployment View](./docs/arc42/07-deployment-view.md).

## License

See [`LICENSE`](./LICENSE).
