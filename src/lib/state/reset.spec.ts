import { describe, expect, it } from 'vitest';
import { appKeysToClear } from './reset.js';

describe('appKeysToClear', () => {
	it('removes the app’s own keys', () => {
		expect(appKeysToClear(['riddlon:onboarded', 'riddlon:app-settings'])).toEqual([
			'riddlon:onboarded',
			'riddlon:app-settings'
		]);
	});

	it('removes the active-package pointer, which the wipe would otherwise leave dangling', () => {
		// A pointer to a deleted package is exactly what made the app claim a story was active
		// while the library was empty.
		expect(appKeysToClear(['riddlon:active-package'])).toEqual(['riddlon:active-package']);
	});

	it('keeps the LLM model-cache markers, so a reset triggers no re-download', () => {
		expect(
			appKeysToClear(['riddlon:onboarded', 'riddlon:llm:cached:Llama-3.2-3B-Instruct-q4f16_1-MLC'])
		).toEqual(['riddlon:onboarded']);
	});

	it('still removes the Gemini API key, a credential rather than a cache marker', () => {
		expect(
			appKeysToClear([
				'riddlon:llm:cached:Llama-3.2-3B-Instruct-q4f16_1-MLC',
				'riddlon:llm:gemini-key'
			])
		).toEqual(['riddlon:llm:gemini-key']);
	});

	it('leaves keys belonging to other apps on the same origin alone', () => {
		expect(appKeysToClear(['theme', 'webllm/model_lib', 'riddlon:onboarded'])).toEqual([
			'riddlon:onboarded'
		]);
	});
});
