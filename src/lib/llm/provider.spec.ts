import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MODEL_ID } from './catalog.js';

vi.mock('$app/environment', () => ({ browser: true }));

/**
 * `resolveNative` reads straight off `window`, so the only way to exercise `resolveFresh`'s
 * native-vs-WebLLM branch in Node is to stand up a bare `window` global ourselves — same idea as
 * `fake-indexeddb` for storage specs. `resolveWebLlm` itself never touches `@mlc-ai/web-llm` (that
 * import is lazy, inside `webllm-direct.ts`'s `create()`), so these tests never need to mock it —
 * they only ever check which `kind` came back.
 */
describe('force-WebLLM override (issue #69 step 1 harness)', () => {
	beforeEach(async () => {
		vi.resetModules();
		(globalThis as { window?: unknown }).window = {
			LanguageModel: { availability: vi.fn().mockResolvedValue('available') }
		};
	});

	afterEach(() => {
		delete (globalThis as { window?: unknown }).window;
	});

	it('resolves native by default when a native candidate is present', async () => {
		const { resolveProvider } = await import('./provider.js');
		const provider = await resolveProvider(DEFAULT_MODEL_ID);
		expect(provider.kind).toBe('native');
	});

	it('skips native and resolves WebLLM once forced, even with a native candidate present', async () => {
		const { resolveProvider, setForceWebLlm, isForcingWebLlm } = await import('./provider.js');
		setForceWebLlm(true);
		expect(isForcingWebLlm()).toBe(true);

		const provider = await resolveProvider(DEFAULT_MODEL_ID);
		expect(provider.kind).toBe('webllm');
	});

	it('resumes resolving native once un-forced', async () => {
		const { resolveProvider, resetProvider, setForceWebLlm } = await import('./provider.js');
		setForceWebLlm(true);
		expect((await resolveProvider(DEFAULT_MODEL_ID)).kind).toBe('webllm');

		setForceWebLlm(false);
		resetProvider();
		expect((await resolveProvider(DEFAULT_MODEL_ID)).kind).toBe('native');
	});
});

/**
 * Issue #84: a stored Gemini key is only ever tried once WebLLM itself can't run the requested
 * model — never preferred over a usable local model, and never attempted without a key.
 */
describe('Gemini fallback (issue #84)', () => {
	const cannotRunLocally = {
		hasNativeLanguageModel: false,
		hasWebGpu: false,
		maxBufferBytes: undefined,
		metered: undefined
	};

	beforeEach(() => {
		vi.resetModules();
		// No native candidate on this global — resolveNative() must fall through cleanly.
		(globalThis as { window?: unknown }).window = {};
	});

	afterEach(() => {
		delete (globalThis as { window?: unknown }).window;
		vi.doUnmock('./gemini-key.js');
	});

	it('resolves WebLLM anyway when no Gemini key is stored, even though the model cannot run', async () => {
		vi.doMock('./gemini-key.js', () => ({ getGeminiApiKey: () => undefined }));
		const { resolveProvider } = await import('./provider.js');
		const provider = await resolveProvider(DEFAULT_MODEL_ID, cannotRunLocally);
		expect(provider.kind).toBe('webllm');
	});

	it('falls back to Gemini once a key is stored and the model cannot run locally', async () => {
		vi.doMock('./gemini-key.js', () => ({ getGeminiApiKey: () => 'test-key' }));
		const { resolveProvider } = await import('./provider.js');
		const provider = await resolveProvider(DEFAULT_MODEL_ID, cannotRunLocally);
		expect(provider.kind).toBe('gemini');
		expect(provider.geminiModelId).toBeTruthy();
	});

	it('never prefers Gemini over a model that can run locally, even with a key stored', async () => {
		vi.doMock('./gemini-key.js', () => ({ getGeminiApiKey: () => 'test-key' }));
		const { resolveProvider } = await import('./provider.js');
		const provider = await resolveProvider(DEFAULT_MODEL_ID, {
			...cannotRunLocally,
			hasWebGpu: true
		});
		expect(provider.kind).toBe('webllm');
	});
});
