import { describe, expect, it } from 'vitest';
import { appKeysToClear } from './reset.js';

describe('appKeysToClear', () => {
	it('removes the app’s own keys', () => {
		expect(appKeysToClear(['riddlon:onboarded', 'riddlon:app-settings'])).toEqual([
			'riddlon:onboarded',
			'riddlon:app-settings'
		]);
	});

	it('keeps the LLM model-cache markers, so a reset triggers no re-download', () => {
		expect(
			appKeysToClear(['riddlon:onboarded', 'riddlon:llm:cached:Llama-3.2-3B-Instruct-q4f16_1-MLC'])
		).toEqual(['riddlon:onboarded']);
	});

	it('leaves keys belonging to other apps on the same origin alone', () => {
		expect(appKeysToClear(['theme', 'webllm/model_lib', 'riddlon:onboarded'])).toEqual([
			'riddlon:onboarded'
		]);
	});
});
