import { describe, expect, it } from 'vitest';
import {
	bestSupportedModelId,
	canRunModel,
	unsupportedModelReason,
	type LlmCapabilities
} from './capabilities.js';

function facts(overrides: Partial<LlmCapabilities> = {}): LlmCapabilities {
	return {
		hasNativeLanguageModel: false,
		hasWebGpu: true,
		maxBufferBytes: undefined,
		metered: undefined,
		...overrides
	};
}

describe('unsupportedModelReason', () => {
	it('is undefined once a native Prompt API is present, whatever the device would otherwise support', () => {
		expect(
			unsupportedModelReason(
				facts({ hasNativeLanguageModel: true, hasWebGpu: false }),
				'llama-3.2-3b'
			)
		).toBeUndefined();
	});

	it('blames no-webgpu when the device has no WebGPU at all', () => {
		expect(unsupportedModelReason(facts({ hasWebGpu: false }), 'llama-3.2-3b')).toBe('no-webgpu');
	});

	it('blames insufficient-vram when WebGPU exists but the buffer is too small for the model', () => {
		const tooSmall = facts({ maxBufferBytes: 100 * 1024 * 1024 });
		expect(unsupportedModelReason(tooSmall, 'llama-3.2-3b')).toBe('insufficient-vram');
	});

	it('is undefined when the device comfortably fits the model', () => {
		expect(unsupportedModelReason(facts(), 'llama-3.2-3b')).toBeUndefined();
	});
});

describe('canRunModel', () => {
	it('agrees with unsupportedModelReason being undefined', () => {
		expect(canRunModel(facts({ hasWebGpu: false }), 'llama-3.2-3b')).toBe(false);
		expect(canRunModel(facts(), 'llama-3.2-3b')).toBe(true);
	});
});

describe('bestSupportedModelId', () => {
	it('prefers the largest model that fits the device', () => {
		expect(bestSupportedModelId(facts())).toBe('llama-3.2-3b');
	});

	it('falls back to the 1B model when the device cannot hold the 3B one', () => {
		// Above the 1B floor (~220 MB) but below the 3B floor (566 MB).
		const small = facts({ maxBufferBytes: 300 * 1024 * 1024 });
		expect(bestSupportedModelId(small)).toBe('llama-3.2-1b');
	});

	it('falls back to the catalog default when nothing fits', () => {
		expect(bestSupportedModelId(facts({ hasWebGpu: false }))).toBe('llama-3.2-3b');
	});
});
