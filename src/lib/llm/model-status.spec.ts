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
	unsupportedReason: undefined,
	hasEndpointConfig: false
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
			expect(modelRowStatus({ ...base, hasNativeLanguageModel: true, backend: 'webllm' })).toEqual({
				kind: 'inactive'
			});
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

			// Nothing is loading — this row must not borrow another row's progress.
			expect(
				modelRowStatus({
					...webllmBase,
					hasNativeLanguageModel: false,
					status: 'downloading',
					progress: 0.42,
					loadingModelId: null
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
					activeModelId: null
				})
			).toEqual({ kind: 'inactive' });
		});
	});

	describe('the endpoint row', () => {
		const endpointBase: ModelRowInput = { ...base, kind: 'openai' };

		it('reports that nothing has been entered yet', () => {
			expect(
				modelRowStatus({ ...endpointBase, hasNativeLanguageModel: true, hasEndpointConfig: false })
			).toEqual({ kind: 'not-configured' });
		});

		it('is inactive while configured but not yet the resolved backend', () => {
			expect(
				modelRowStatus({ ...endpointBase, hasEndpointConfig: true, backend: 'webllm' })
			).toEqual({ kind: 'inactive' });
		});

		it('is active once the endpoint has resolved and is ready', () => {
			expect(
				modelRowStatus({
					...endpointBase,
					hasEndpointConfig: true,
					backend: 'openai',
					status: 'ready'
				})
			).toEqual({ kind: 'active' });
		});

		it('wins over a present native Prompt API', () => {
			// The opposite of the Gemini tier this replaced: a configured endpoint outranks the local
			// backends rather than rescuing a device that has none.
			expect(
				modelRowStatus({
					...endpointBase,
					hasNativeLanguageModel: true,
					hasEndpointConfig: true,
					backend: 'openai',
					status: 'ready'
				})
			).toEqual({ kind: 'active' });
		});
	});

	describe('precedence of a configured endpoint over the local rows', () => {
		it('pushes the native row to inactive', () => {
			expect(
				modelRowStatus({
					...base,
					kind: 'native',
					hasNativeLanguageModel: true,
					hasEndpointConfig: true,
					backend: 'openai',
					status: 'ready'
				})
			).toEqual({ kind: 'inactive' });
		});

		it('pushes a runnable WebLLM row to inactive', () => {
			expect(
				modelRowStatus({
					...base,
					kind: 'llama-3.2-3b',
					hasNativeLanguageModel: false,
					hasEndpointConfig: true,
					backend: 'openai',
					status: 'ready'
				})
			).toEqual({ kind: 'inactive' });
		});

		it('still explains why a WebLLM row could not have run anyway', () => {
			// "kein WebGPU" is diagnosis the player needs whether or not something else is running,
			// so it survives the precedence check rather than being flattened to "inactive".
			expect(
				modelRowStatus({
					...base,
					kind: 'llama-3.2-3b',
					hasNativeLanguageModel: false,
					hasEndpointConfig: true,
					unsupportedReason: 'no-webgpu',
					backend: 'openai',
					status: 'ready'
				})
			).toEqual({ kind: 'unsupported', reason: 'no-webgpu' });
		});

		it('still reports an absent native Prompt API', () => {
			expect(
				modelRowStatus({
					...base,
					kind: 'native',
					hasNativeLanguageModel: false,
					hasEndpointConfig: true,
					backend: 'openai',
					status: 'ready'
				})
			).toEqual({ kind: 'unavailable' });
		});
	});
});
