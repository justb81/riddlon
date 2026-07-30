/**
 * Native first, WebLLM polyfill second — and the only file in the app that knows either exists.
 *
 * Ordering matters here. `prompt-api-polyfill` installs itself on `globalThis.LanguageModel` as an
 * import side effect when no native one is present, so the native probe has to run *before* the
 * import, and we always consume the module's named export rather than reading the global back. That
 * way "is there a built-in model?" stays answerable and we never shadow the browser's own API.
 *
 * The polyfill picks its backend from a window global, first match with a truthy `apiKey` winning,
 * and with *no* config set it silently falls back to Transformers.js. So `WEBLLM_CONFIG` must be set
 * before the import, every time — and the four cloud backends are aliased to a throwing stub at
 * build time (see vite.config.ts) so they cannot be reached even by accident.
 */

import { browser } from '$app/environment';
import { findModel, type LocalModelId } from './catalog.js';
import { LlmError } from './errors.js';
import type { LanguageModelLike, ResolvedProvider } from './types.js';

interface WebLlmConfig {
	/** The polyfill requires a truthy value to select the backend; WebLLM never sends it anywhere. */
	apiKey: string;
	modelName: string;
}

declare global {
	interface Window {
		LanguageModel?: LanguageModelLike & { __isPolyfill?: boolean };
		WEBLLM_CONFIG?: WebLlmConfig;
	}
}

/** Memoized per model id: switching models must re-import with a different `WEBLLM_CONFIG`. */
let cached: { modelId: LocalModelId; provider: ResolvedProvider } | undefined;
let inFlight: { modelId: LocalModelId; promise: Promise<ResolvedProvider> } | undefined;

export async function resolveProvider(modelId: LocalModelId): Promise<ResolvedProvider> {
	if (!browser) throw new LlmError('no-webgpu');

	if (cached?.modelId === modelId) return cached.provider;
	if (inFlight?.modelId === modelId) return inFlight.promise;

	const promise = resolveFresh(modelId);
	inFlight = { modelId, promise };

	try {
		const provider = await promise;
		cached = { modelId, provider };
		return provider;
	} finally {
		if (inFlight?.promise === promise) inFlight = undefined;
	}
}

async function resolveFresh(modelId: LocalModelId): Promise<ResolvedProvider> {
	const native = await resolveNative();
	if (native) return native;
	return resolvePolyfill(modelId);
}

async function resolveNative(): Promise<ResolvedProvider | undefined> {
	const candidate = window.LanguageModel;
	// A polyfill installed by an earlier resolve is not a native implementation.
	if (!candidate || candidate.__isPolyfill) return undefined;

	try {
		const availability = await candidate.availability({
			expectedInputs: [{ type: 'text' }],
			expectedOutputs: [{ type: 'text' }]
		});
		if (availability === 'unavailable') return undefined;
	} catch {
		// A built-in API that throws on a plain text probe is not one we can use.
		return undefined;
	}

	logResolved('native');
	return { kind: 'native', LanguageModel: candidate };
}

async function resolvePolyfill(modelId: LocalModelId): Promise<ResolvedProvider> {
	const model = findModel(modelId);

	// Must be set before the import, and re-set on every resolve: the WebLLM backend reads
	// `modelName` off this global at create() time, not at import time.
	window.WEBLLM_CONFIG = { apiKey: 'riddlon-local', modelName: model.mlcModelId };

	let LanguageModel: LanguageModelLike;
	try {
		const module = await import('prompt-api-polyfill');
		LanguageModel = module.LanguageModel as unknown as LanguageModelLike;
	} catch (error) {
		throw new LlmError('download-failed', { cause: error });
	}

	logResolved('polyfill', model.mlcModelId);
	return { kind: 'polyfill', LanguageModel, mlcModelId: model.mlcModelId };
}

/**
 * The only way to tell from the outside which backend actually got picked — the manual verification
 * checklist relies on it, since a GPU-less CI can never exercise this path.
 */
function logResolved(kind: 'native' | 'polyfill', mlcModelId?: string): void {
	const detail = mlcModelId ? ` (${mlcModelId})` : '';
	console.info(`[riddlon/llm] inference backend: ${kind}${detail}`);
}

/** Drops the memo so the next resolve re-reads the catalog. Call when the model choice changes. */
export function resetProvider(): void {
	cached = undefined;
	inFlight = undefined;
}

/** Test-only alias, matching the `resetDbConnectionForTests` convention in $lib/storage/db.ts. */
export function resetProviderForTests(): void {
	resetProvider();
}
