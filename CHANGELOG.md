# Changelog

## [0.7.3](https://github.com/justb81/riddlon/compare/riddlon-v0.7.2...riddlon-v0.7.3) (2026-07-30)


### Bug Fixes

* **llm:** salvage near-miss director verdicts instead of dropping them ([3e8da8b](https://github.com/justb81/riddlon/commit/3e8da8b351e467b738489138adadf013b905ea20))

## [0.7.2](https://github.com/justb81/riddlon/compare/riddlon-v0.7.1...riddlon-v0.7.2) (2026-07-30)


### Bug Fixes

* **ui:** keep the app header at 60px when the OS titlebar is collapsed ([4902b16](https://github.com/justb81/riddlon/commit/4902b165ed2f35d829022f95759c93f994c6c028))
* **ui:** keep the app header at 60px when the OS titlebar is collapsed ([7292ea8](https://github.com/justb81/riddlon/commit/7292ea873b299985e712c304425ea6b3d3ca5184))

## [0.7.1](https://github.com/justb81/riddlon/compare/riddlon-v0.7.0...riddlon-v0.7.1) (2026-07-30)


### Bug Fixes

* **llm:** re-apply a scene's persona to an ongoing session ([73da844](https://github.com/justb81/riddlon/commit/73da844e347902f0d10994c8afb9de52023c4dd8))
* **llm:** re-apply a scene's persona to an ongoing session ([4f3a78e](https://github.com/justb81/riddlon/commit/4f3a78e3ec7e535bca70f513a9be1804f3b53906))

## [0.7.0](https://github.com/justb81/riddlon/compare/riddlon-v0.6.2...riddlon-v0.7.0) (2026-07-30)


### Features

* **content:** bundle the example story and pack clue counts into progress ([358c757](https://github.com/justb81/riddlon/commit/358c7572163c20efefce550fa8d8330d284e563d))
* **llm:** build personas and judge story progress from the conversation ([df57957](https://github.com/justb81/riddlon/commit/df57957112409de606c8d81a2b37a7ebab41ee90))


### Bug Fixes

* drive chats from the installed package, delete the demo mockups ([a465c4f](https://github.com/justb81/riddlon/commit/a465c4f6806ef539abe6461ff104db816f4bcf71))
* **engine:** activate an installed package, and drive chats from its content ([ecd0b97](https://github.com/justb81/riddlon/commit/ecd0b97c0a7b2e96ee5d088c8399db2b94846915))

## [0.6.2](https://github.com/justb81/riddlon/compare/riddlon-v0.6.1...riddlon-v0.6.2) (2026-07-30)


### Bug Fixes

* **ui:** close the async load gap that flashed empty chats / 0-of-0 ([63bf43c](https://github.com/justb81/riddlon/commit/63bf43c4a37af67a2880a2d0a46a5879577d3f94))
* **ui:** close the async load gap that flashed empty chats / 0-of-0 ([#38](https://github.com/justb81/riddlon/issues/38)) ([66cdb0c](https://github.com/justb81/riddlon/commit/66cdb0c39a426f152348a03c312fd69096b5557f))

## [0.6.1](https://github.com/justb81/riddlon/compare/riddlon-v0.6.0...riddlon-v0.6.1) (2026-07-30)


### Bug Fixes

* **engine:** let storyRuntime run a live session per installed package ([f19e59d](https://github.com/justb81/riddlon/commit/f19e59d781b93edf05c9abd2bce2c427bcd56e15))

## [0.6.0](https://github.com/justb81/riddlon/compare/riddlon-v0.5.0...riddlon-v0.6.0) (2026-07-30)


### Features

* **settings:** add a reset that really clears the demo content ([02d1c11](https://github.com/justb81/riddlon/commit/02d1c110b5c39e7400014c2a65574303c9016aa4))
* **settings:** add a reset that really clears the demo content ([605dcd1](https://github.com/justb81/riddlon/commit/605dcd1d8176504163c5059ff113bf3385b78951))


### Bug Fixes

* **chat:** source the contradiction panel from real engine clue state ([#35](https://github.com/justb81/riddlon/issues/35)) ([feb08f2](https://github.com/justb81/riddlon/commit/feb08f22fa26a68eeb22259df33e7f256abd491c))
* **chat:** source the contradiction panel from real engine clue state ([#35](https://github.com/justb81/riddlon/issues/35)) ([95c5715](https://github.com/justb81/riddlon/commit/95c5715fff75a9815866a1e4e4c5916aea6f9c9d))
* **settings:** show the real app version instead of hardcoded v0.1 ([5be1000](https://github.com/justb81/riddlon/commit/5be1000778d41278e85d046b98d1d9d3a9703d33))
* **settings:** show the real app version instead of hardcoded v0.1 ([767bbe4](https://github.com/justb81/riddlon/commit/767bbe43479ca5a9b84dec2af025db2412cb90e1))

## [0.5.0](https://github.com/justb81/riddlon/compare/riddlon-v0.4.0...riddlon-v0.5.0) (2026-07-30)


### Features

* **chat:** drive conversations from the real engine and LLM ([#14](https://github.com/justb81/riddlon/issues/14), [#15](https://github.com/justb81/riddlon/issues/15)) ([2822a85](https://github.com/justb81/riddlon/commit/2822a85220a9b359f71a2b3ff2787072e4e624ed))
* **riddlon:** wire ZIP/URL import to the real content pipeline ([#16](https://github.com/justb81/riddlon/issues/16)) ([ff1d96c](https://github.com/justb81/riddlon/commit/ff1d96c819bc75aeb28bdb8095332b05e2b9e26b))
* **settings:** persist player profile and support free-text pronouns ([#18](https://github.com/justb81/riddlon/issues/18)) ([825621c](https://github.com/justb81/riddlon/commit/825621cf23494b68b78d0ac1912375d4d0238da7))
* **story:** install a real reference package and drive boot from it ([#13](https://github.com/justb81/riddlon/issues/13)) ([344de69](https://github.com/justb81/riddlon/commit/344de697f3a1325e0ba315a976709394a0dd7bbb))
* **story:** show real scene progress on the story overview ([#17](https://github.com/justb81/riddlon/issues/17)) ([80b515e](https://github.com/justb81/riddlon/commit/80b515eced266f9d066ded36da9c6397355b31f0))

## [0.4.0](https://github.com/justb81/riddlon/compare/riddlon-v0.3.0...riddlon-v0.4.0) (2026-07-30)


### Features

* **content:** implement ZIP and URL story-package import ([#10](https://github.com/justb81/riddlon/issues/10), [#11](https://github.com/justb81/riddlon/issues/11)) ([110d449](https://github.com/justb81/riddlon/commit/110d44948a84341540a3423bdb3965626efcf564))
* **content:** implement ZIP and URL story-package import ([#10](https://github.com/justb81/riddlon/issues/10), [#11](https://github.com/justb81/riddlon/issues/11)) ([1f6edb7](https://github.com/justb81/riddlon/commit/1f6edb79b6fa4075cb1687b86cc1cb2d6ce9f94e))
* **content:** ship "Lucys Portmonnaie" as a real story package with a release pipeline ([a4a2bf6](https://github.com/justb81/riddlon/commit/a4a2bf696b605309fe933d579fb05498736193b0))
* **content:** ship "Lucys Portmonnaie" as a real story package with a release pipeline ([a3af1eb](https://github.com/justb81/riddlon/commit/a3af1eb1cb8df28455d6abd58592acbc2fc3d2e0))

## [0.3.0](https://github.com/justb81/riddlon/compare/riddlon-v0.2.0...riddlon-v0.3.0) (2026-07-30)


### Features

* **engine:** implement story state-graph engine, clue tracking, and delayed events ([211804f](https://github.com/justb81/riddlon/commit/211804fdac61b2fb8f5fd2e424b3a3c26aedbf59))
* **engine:** story state-graph engine, clue tracking, and delayed events ([d7c6d23](https://github.com/justb81/riddlon/commit/d7c6d23a0fcf8904d0c0f46634e72917f80671ff))
* implement story package schemas, IndexedDB registry, and character library ([86ef314](https://github.com/justb81/riddlon/commit/86ef3149860cad6feb6f3fa9ae894c1e48ff0006))
* **llm:** add Prompt API adapter with WebLLM polyfill fallback ([638c1ca](https://github.com/justb81/riddlon/commit/638c1cab915784fca467c17249c88da8f4901796))
* **llm:** add Prompt API adapter with WebLLM polyfill fallback ([d3535be](https://github.com/justb81/riddlon/commit/d3535be4da5e8e7c6f59fd3f815b88d08186ceb8)), closes [#12](https://github.com/justb81/riddlon/issues/12)
* **ui:** responsive desktop layout for all screens ([8be6328](https://github.com/justb81/riddlon/commit/8be6328fadd6a5fbce00c35beb0ace872308263d))
* **ui:** responsive desktop layout for all screens ([7a12f0a](https://github.com/justb81/riddlon/commit/7a12f0a63608902d735462143a746e7399cca7c0))


### Bug Fixes

* **llm:** verify and fix the Prompt API adapter for real ([355f198](https://github.com/justb81/riddlon/commit/355f1980b9a1bbc689bc64b19f8a1e548ad087a4))

## [0.2.0](https://github.com/justb81/riddlon/compare/riddlon-v0.1.0...riddlon-v0.2.0) (2026-07-29)


### Features

* Initialize Riddlon branding on the PWA template ([ac16889](https://github.com/justb81/riddlon/commit/ac16889941f9e91d4c83733dc62fd786949fbdbc))
