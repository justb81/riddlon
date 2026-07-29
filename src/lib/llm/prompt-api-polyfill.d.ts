/**
 * `prompt-api-polyfill` ships no types of its own. We only ever touch its named `LanguageModel`
 * export (see `provider.ts`), and immediately cast it to our own structural `LanguageModelLike` —
 * so this declaration just needs to satisfy the import, not describe the whole package.
 */
declare module 'prompt-api-polyfill' {
	const LanguageModel: unknown;
	export { LanguageModel };
}
