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

	it('skips native and resolves the polyfill once forced, even with a native candidate present', async () => {
		const { resolveProvider, setForceWebLlm, isForcingWebLlm } = await import('./provider.js');
		setForceWebLlm(true);
		expect(isForcingWebLlm()).toBe(true);

		const provider = await resolveProvider(DEFAULT_MODEL_ID);
		expect(provider.kind).toBe('polyfill');
	});

	it('resumes resolving native once un-forced', async () => {
		const { resolveProvider, resetProvider, setForceWebLlm } = await import('./provider.js');
		setForceWebLlm(true);
		expect((await resolveProvider(DEFAULT_MODEL_ID)).kind).toBe('polyfill');

		setForceWebLlm(false);
		resetProvider();
		expect((await resolveProvider(DEFAULT_MODEL_ID)).kind).toBe('native');
	});
});
