import { describe, expect, it } from 'vitest';
import {
	isMeteredConnection,
	resolveBackend,
	shouldAutoStartDownload
} from './capabilities-rules.js';

describe('resolveBackend', () => {
	it('prefers the built-in model, which needs no download at all', () => {
		expect(resolveBackend({ hasNativeLanguageModel: true, hasWebGpu: true })).toEqual({
			backend: 'native'
		});
		expect(resolveBackend({ hasNativeLanguageModel: true, hasWebGpu: false })).toEqual({
			backend: 'native'
		});
	});

	it('falls back to WebLLM when only WebGPU is available', () => {
		expect(resolveBackend({ hasNativeLanguageModel: false, hasWebGpu: true })).toEqual({
			backend: 'webllm'
		});
	});

	it('reports a renderable reason when neither is available', () => {
		expect(resolveBackend({ hasNativeLanguageModel: false, hasWebGpu: false })).toEqual({
			backend: 'none',
			reason: 'no-webgpu'
		});
	});
});

describe('isMeteredConnection', () => {
	it('honours an explicit data-saver preference', () => {
		expect(isMeteredConnection({ saveData: true, effectiveType: '4g' })).toBe(true);
	});

	it('treats slow connection types as metered', () => {
		for (const effectiveType of ['slow-2g', '2g', '3g']) {
			expect(isMeteredConnection({ saveData: false, effectiveType })).toBe(true);
		}
	});

	it('treats fast connections as unmetered', () => {
		expect(isMeteredConnection({ saveData: false, effectiveType: '4g' })).toBe(false);
	});

	it('treats missing information as unmetered', () => {
		// navigator.connection is Chromium-only — assuming "metered" would show every Firefox and
		// Safari user a consent step the design never asked for.
		expect(isMeteredConnection({ saveData: undefined, effectiveType: undefined })).toBe(false);
	});
});

describe('shouldAutoStartDownload', () => {
	it('starts on its own unless the connection is known to be metered', () => {
		expect(shouldAutoStartDownload(false)).toBe(true);
		expect(shouldAutoStartDownload(undefined)).toBe(true);
		expect(shouldAutoStartDownload(true)).toBe(false);
	});
});
