import { describe, expect, it } from 'vitest';
import de from '$lib/i18n/de.json' with { type: 'json' };
import {
	LlmError,
	classifyLoadError,
	i18nKeyForLlmError,
	isLlmError,
	type LlmErrorCode
} from './errors.js';

const ALL_CODES: LlmErrorCode[] = [
	'no-webgpu',
	'insufficient-vram',
	'offline',
	'download-failed',
	'compile-failed',
	'oom',
	'aborted',
	'unsupported-model',
	'unknown'
];

describe('LlmError', () => {
	it('carries its code and is recognisable', () => {
		const error = new LlmError('oom');
		expect(error.code).toBe('oom');
		expect(isLlmError(error)).toBe(true);
		expect(isLlmError(new Error('oom'))).toBe(false);
	});

	it('keeps the partial output of an aborted generation', () => {
		expect(new LlmError('aborted', { partial: 'Ich war ge' }).partial).toBe('Ich war ge');
	});
});

describe('i18nKeyForLlmError', () => {
	it('every error code has a German message', () => {
		// Guards the drift this kind of table always develops: a new code with no dictionary entry
		// would otherwise surface to the player as a raw key.
		const messages = de.llm.error as Record<string, string | undefined>;
		for (const code of ALL_CODES) {
			expect(i18nKeyForLlmError(code)).toBe(`llm.error.${code}`);
			expect(messages[code], `missing de.json entry for ${code}`).toBeTruthy();
		}
	});

	it('has no dictionary entries without a matching code', () => {
		expect(Object.keys(de.llm.error).sort()).toEqual([...ALL_CODES].sort());
	});
});

describe('classifyLoadError', () => {
	it('passes an already-classified error through', () => {
		expect(classifyLoadError(new LlmError('insufficient-vram'))).toBe('insufficient-vram');
	});

	it('recognises an abort before anything else', () => {
		expect(classifyLoadError(new DOMException('Aborted', 'AbortError'))).toBe('aborted');
		expect(classifyLoadError(new Error('The operation was aborted'))).toBe('aborted');
	});

	it('maps NotSupportedError to a missing WebGPU', () => {
		expect(classifyLoadError(new DOMException('nope', 'NotSupportedError'))).toBe('no-webgpu');
	});

	it('recognises out-of-memory over a device-lost message', () => {
		// A device lost *because* an allocation failed should read as OOM: that's the one the player
		// can act on, by picking the smaller model.
		expect(classifyLoadError(new Error('Device lost: out of memory'))).toBe('oom');
		expect(classifyLoadError(new Error('buffer size exceeds the limit'))).toBe('oom');
	});

	it('recognises shader and device failures as compile failures', () => {
		expect(classifyLoadError(new Error('createComputePipeline failed'))).toBe('compile-failed');
		expect(classifyLoadError(new Error('Device lost'))).toBe('compile-failed');
	});

	it('recognises transfer failures', () => {
		expect(classifyLoadError(new TypeError('Failed to fetch'))).toBe('download-failed');
	});

	it('falls back to unknown for anything unrecognisable', () => {
		expect(classifyLoadError(new Error('kaputt'))).toBe('unknown');
		expect(classifyLoadError(undefined)).toBe('unknown');
	});
});
