import { describe, expect, it } from 'vitest';
import { modelRowStatus, type ModelRowInput } from './model-status.js';

const base: ModelRowInput = {
	kind: 'native',
	backend: null,
	activeModelId: null,
	loadingModelId: null,
	status: 'idle',
	progress: 0,
	hasNativeLanguageModel: false,
	unsupportedReason: undefined
};

describe('modelRowStatus', () => {
	it('reports checking before capabilities have been probed, for every row', () => {
		expect(modelRowStatus({ ...base, hasNativeLanguageModel: undefined })).toEqual({
			kind: 'checking'
		});
		expect(
			modelRowStatus({ ...base, kind: 'llama-3.2-3b', hasNativeLanguageModel: undefined })
		).toEqual({ kind: 'checking' });
	});

	describe('the native row', () => {
		it('is unavailable when this browser has no Prompt API', () => {
			expect(modelRowStatus({ ...base, hasNativeLanguageModel: false })).toEqual({
				kind: 'unavailable'
			});
		});

		it('is inactive when present but not the resolved backend yet', () => {
			expect(modelRowStatus({ ...base, hasNativeLanguageModel: true, backend: null })).toEqual({
				kind: 'inactive'
			});
			expect(
				modelRowStatus({ ...base, hasNativeLanguageModel: true, backend: 'polyfill' })
			).toEqual({ kind: 'inactive' });
		});

		it('reports its own download/prepare progress while native is loading', () => {
			expect(
				modelRowStatus({
					...base,
					hasNativeLanguageModel: true,
					backend: 'native',
					status: 'downloading',
					progress: 0.3
				})
			).toEqual({ kind: 'downloading', percent: 30 });

			expect(
				modelRowStatus({
					...base,
					hasNativeLanguageModel: true,
					backend: 'native',
					status: 'preparing',
					progress: 0.95
				})
			).toEqual({ kind: 'preparing', percent: 95 });
		});

		it('is active once native has resolved and is ready', () => {
			expect(
				modelRowStatus({
					...base,
					hasNativeLanguageModel: true,
					backend: 'native',
					status: 'ready'
				})
			).toEqual({ kind: 'active' });
		});
	});

	describe('a WebLLM catalog row', () => {
		const webllmBase: ModelRowInput = { ...base, kind: 'llama-3.2-3b' };

		it('is inactive whenever native is present, regardless of catalog state', () => {
			expect(
				modelRowStatus({ ...webllmBase, hasNativeLanguageModel: true, activeModelId: null })
			).toEqual({ kind: 'inactive' });
		});

		it('surfaces the specific unsupported reason once native is known absent', () => {
			expect(
				modelRowStatus({
					...webllmBase,
					hasNativeLanguageModel: false,
					unsupportedReason: 'no-webgpu'
				})
			).toEqual({ kind: 'unsupported', reason: 'no-webgpu' });
		});

		it('reports progress only for the model actually loading', () => {
			expect(
				modelRowStatus({
					...webllmBase,
					hasNativeLanguageModel: false,
					status: 'downloading',
					progress: 0.42,
					loadingModelId: 'llama-3.2-3b'
				})
			).toEqual({ kind: 'downloading', percent: 42 });

			// A different model is loading — this row must not borrow its progress.
			expect(
				modelRowStatus({
					...webllmBase,
					hasNativeLanguageModel: false,
					status: 'downloading',
					progress: 0.42,
					loadingModelId: 'llama-3.2-1b'
				})
			).toEqual({ kind: 'inactive' });
		});

		it('is active only once it is both the active model and ready', () => {
			expect(
				modelRowStatus({
					...webllmBase,
					hasNativeLanguageModel: false,
					status: 'ready',
					activeModelId: 'llama-3.2-3b'
				})
			).toEqual({ kind: 'active' });

			expect(
				modelRowStatus({
					...webllmBase,
					hasNativeLanguageModel: false,
					status: 'ready',
					activeModelId: 'llama-3.2-1b'
				})
			).toEqual({ kind: 'inactive' });
		});
	});
});
