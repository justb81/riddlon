# Changelog

## [0.11.0](https://github.com/justb81/riddlon/compare/riddlon-v0.10.0...riddlon-v0.11.0) (2026-09-01)


### Features

* **content:** format 1.1.0 — achievement conditions, seed chats, authored endings, tags ([eb49dfe](https://github.com/justb81/riddlon/commit/eb49dfe3628cbcd3307d6b26994d6d627398383b))
* **llm:** add OpenAI-compatible inference endpoint, replacing Gemini BYOK ([c942d0e](https://github.com/justb81/riddlon/commit/c942d0ed5ecbd9eb89d89bc864a695d93d189e95))
* **llm:** add OpenAI-compatible inference endpoint, replacing Gemini BYOK ([50feb5f](https://github.com/justb81/riddlon/commit/50feb5f6e54c5c0ef01517a33fb197af5c59a91d))
* **stories:** fill format 1.1.0 in the reference story, plus its wrong-accusation branch ([fe5bbd5](https://github.com/justb81/riddlon/commit/fe5bbd50a0f3cc7b5c747cc73cfe52c1a485a4f6))


### Bug Fixes

* drop accidentally committed .claude/settings.local.json ([7eee098](https://github.com/justb81/riddlon/commit/7eee09841753aa2e75a65b08812e2577dd5821c0))
* **ui:** prettier the new spec, and stop the ending screen repeating itself ([067b4b0](https://github.com/justb81/riddlon/commit/067b4b06752c98dd848d68acc81af59ba9410530))

## [0.10.0](https://github.com/justb81/riddlon/compare/riddlon-v0.9.2...riddlon-v0.10.0) (2026-08-02)


### Features

* **llm:** drop unusable 1B model tier, add optional Gemini cloud fallback ([c5695d1](https://github.com/justb81/riddlon/commit/c5695d14cb57a513b49e39b27d353bb757a9e9ef))

## [0.9.2](https://github.com/justb81/riddlon/compare/riddlon-v0.9.1...riddlon-v0.9.2) (2026-08-02)


### Bug Fixes

* **content:** bump lucys-portmonnaie to v1.2.2 for secret statements ([070de87](https://github.com/justb81/riddlon/commit/070de8723678fcf31b268107c65f9458b83aa4f7))
* **content:** give secrets a full statement, not just a label ([05b0174](https://github.com/justb81/riddlon/commit/05b0174f03a824fd66f067fd3f837ffbc8a28e25))
* **content:** give secrets a full statement, not just a label ([653b54b](https://github.com/justb81/riddlon/commit/653b54b757cacf701a990e40da2ff1fcc950afe1)), closes [#80](https://github.com/justb81/riddlon/issues/80)

## [0.9.1](https://github.com/justb81/riddlon/compare/riddlon-v0.9.0...riddlon-v0.9.1) (2026-08-01)


### Bug Fixes

* **llm:** replace prompt-api-polyfill's WebLLM path with a direct engine ([d3b2e3a](https://github.com/justb81/riddlon/commit/d3b2e3a84ccbfcfa50b6c94fb20311acc6a0dc36))
* **llm:** replace prompt-api-polyfill's WebLLM path with a direct engine ([#69](https://github.com/justb81/riddlon/issues/69)) ([1a6deaf](https://github.com/justb81/riddlon/commit/1a6deaff480d29847d7d533bf78b7c7646f4022d))

## [0.9.0](https://github.com/justb81/riddlon/compare/riddlon-v0.8.0...riddlon-v0.9.0) (2026-07-31)


### Features

* **content:** add story-scoped identity masking for contacts ([#31](https://github.com/justb81/riddlon/issues/31)) ([b3fbea9](https://github.com/justb81/riddlon/commit/b3fbea977dd0ab40e3e3344a391938a75f921966))
* **ui:** bring back package-authored suggestion chips, gated by disguise level ([02c833b](https://github.com/justb81/riddlon/commit/02c833b500fd8c99f9db32bab73285cc6a125f5b))
* **ui:** bring back package-authored suggestion chips, gated by disguise level ([b4581e0](https://github.com/justb81/riddlon/commit/b4581e02751adb4120aca7b25c5d01e948778e1e))


### Bug Fixes

* **chat:** reveal LLM replies as one finished message, not token-by-token ([2f6d516](https://github.com/justb81/riddlon/commit/2f6d516d31c44ae676f3127fe663339ae0580935))
* **chat:** reveal LLM replies as one finished message, not token-by-token ([41b3e1b](https://github.com/justb81/riddlon/commit/41b3e1bc2f9cb0cee3fb27979a0a802aafe36d8e)), closes [#49](https://github.com/justb81/riddlon/issues/49)
* **chat:** stop silently dropping messages when a scene finishes ([fa0d872](https://github.com/justb81/riddlon/commit/fa0d87215858dacebd312a90057fe5a98a650f3e))
* **chat:** stop silently dropping messages when a scene finishes ([d49cb21](https://github.com/justb81/riddlon/commit/d49cb21d5d79867bb55749773b2f956305b616cc))
* **riddlon:** remove noop update/storage quick actions ([da35b09](https://github.com/justb81/riddlon/commit/da35b0976411c641a95e80d0ead89b83a2bc5c25)), closes [#36](https://github.com/justb81/riddlon/issues/36)

## [0.8.0](https://github.com/justb81/riddlon/compare/riddlon-v0.7.4...riddlon-v0.8.0) (2026-07-30)


### Features

* **engine:** add autoOpen scene field for cold vs. self-starting chats ([1c38632](https://github.com/justb81/riddlon/commit/1c38632628601cbd6825809d706e8938bdc667de))


### Bug Fixes

* **llm:** make model status read-only and native/backend-aware ([a9adc68](https://github.com/justb81/riddlon/commit/a9adc689940c5ac9f79468d73017524c358d0124))
* **llm:** read-only, native-aware model status + Llama 3.2-only fallback ([073b707](https://github.com/justb81/riddlon/commit/073b70767c79edc6695318448647006b3bfc5fed))

## [0.7.4](https://github.com/justb81/riddlon/compare/riddlon-v0.7.3...riddlon-v0.7.4) (2026-07-30)


### Bug Fixes

* **llm:** load the model on a warm boot and stop the director stalling scenes ([421618e](https://github.com/justb81/riddlon/commit/421618eb165844d365f5e22733cf28eb8ab99e4b))
* **llm:** warm-boot model load, director scene progress, Windows test path ([c885d2f](https://github.com/justb81/riddlon/commit/c885d2f46844d74ddc526b60f1d1eb6754850e68))

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
