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
 * A configured OpenAI-compatible endpoint outranks everything else — the opposite of the Gemini
 * tier it replaces, which only ran when nothing local could. These three cases are the whole
 * contract: nothing configured falls through to the local path, a configured endpoint wins even
 * against a native Prompt API, and `/dev/llm`'s force-WebLLM override still skips it.
 */
describe('OpenAI-compatible endpoint precedence', () => {
	const CONFIG = { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' };

	beforeEach(() => {
		vi.resetModules();
		// A native candidate *is* present throughout, so "endpoint wins" is a real precedence test
		// rather than an artefact of native being unavailable.
		(globalThis as { window?: unknown }).window = {
			LanguageModel: { availability: vi.fn().mockResolvedValue('available') }
		};
	});

	afterEach(() => {
		delete (globalThis as { window?: unknown }).window;
		vi.doUnmock('./endpoint-config.js');
	});

	it('resolves native when no endpoint is configured', async () => {
		vi.doMock('./endpoint-config.js', () => ({ getEndpointConfig: () => undefined }));
		const { resolveProvider } = await import('./provider.js');
		expect((await resolveProvider(DEFAULT_MODEL_ID)).kind).toBe('native');
	});

	it('prefers a configured endpoint over a usable native Prompt API', async () => {
		vi.doMock('./endpoint-config.js', () => ({ getEndpointConfig: () => CONFIG }));
		const { resolveProvider } = await import('./provider.js');
		const provider = await resolveProvider(DEFAULT_MODEL_ID);
		expect(provider.kind).toBe('openai');
		expect(provider.endpointModelId).toBe('llama3.2');
	});

	it('still drops to WebLLM when the dev harness forces it, endpoint or not', async () => {
		vi.doMock('./endpoint-config.js', () => ({ getEndpointConfig: () => CONFIG }));
		const { resolveProvider, setForceWebLlm } = await import('./provider.js');
		setForceWebLlm(true);
		expect((await resolveProvider(DEFAULT_MODEL_ID)).kind).toBe('webllm');
		setForceWebLlm(false);
	});
});
