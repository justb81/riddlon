/**
 * A player-configured endpoint first, then the browser's native Prompt API, then direct WebLLM —
 * and the only file in the app that knows any of the three exists.
 *
 * The WebLLM path used to go through `prompt-api-polyfill`, whose own backend rebuilt the whole
 * `MLCEngine` on every logical session (issue #69). `webllm-direct.ts` now owns one persistent
 * engine instead, so the native-vs-WebLLM choice is just: probe `globalThis.LanguageModel` for a
 * real built-in implementation, and fall back to WebLLM when there isn't one. `LanguageModel` is
 * still read as a global rather than declared here on `Window`, since a native implementation is
 * the browser's own, not something this module installs.
 *
 * An OpenAI-compatible endpoint outranks both. That is the opposite of the Gemini BYOK tier it
 * replaces, which only ever ran when nothing local could — and it is deliberate: such an endpoint
 * is very often a server on the player's own machine or LAN (Ollama, LM Studio, llama.cpp), so it
 * is usually a better model than the 3B catalogue entry rather than a compromise, and a player who
 * went to the trouble of entering one meant to use it. It is opt-in and empty by default, so the
 * local path stays the default experience.
 */

import { browser } from '$app/environment';
import { findModel, type LocalModelId } from './catalog.js';
import { getEndpointConfig, type InferenceEndpointConfig } from './endpoint-config.js';
import { LlmError } from './errors.js';
import { createOpenAiCompatibleLanguageModel } from './openai-compatible.js';
import { createWebLlmLanguageModel } from './webllm-direct.js';
import type { LanguageModelLike, ProviderKind, ResolvedProvider } from './types.js';

declare global {
	interface Window {
		LanguageModel?: LanguageModelLike & { __isPolyfill?: boolean };
	}
}

/** Memoized per model id: switching models resolves a fresh `ResolvedProvider`. */
let cached: { modelId: LocalModelId; provider: ResolvedProvider } | undefined;
let inFlight: { modelId: LocalModelId; promise: Promise<ResolvedProvider> } | undefined;

/**
 * Dev-only override (issue #69's step 1: measuring `resetChat()` timing needs a real WebLLM
 * session, which a device with a native Prompt API would otherwise always shadow) — skips every
 * tier above WebLLM, the configured endpoint included, so `resolveFresh` falls straight through.
 * Never surfaced to the player; only `/dev/llm` sets it. Caller must `resetProvider()` after
 * flipping it, same as any other change that should affect the next resolve.
 */
let forceWebLlm = false;

export function setForceWebLlm(force: boolean): void {
	forceWebLlm = force;
}

export function isForcingWebLlm(): boolean {
	return forceWebLlm;
}

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
	if (!forceWebLlm) {
		const endpoint = getEndpointConfig();
		if (endpoint) return resolveEndpoint(endpoint);

		const native = await resolveNative();
		if (native) return native;
	}

	return resolveWebLlm(modelId);
}

async function resolveNative(): Promise<ResolvedProvider | undefined> {
	const candidate = window.LanguageModel;
	// `__isPolyfill` is a defensive check, not a live code path: nothing in this app sets a global
	// `LanguageModel` anymore, so a candidate here is either the browser's real implementation or
	// nothing at all.
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

async function resolveWebLlm(modelId: LocalModelId): Promise<ResolvedProvider> {
	const model = findModel(modelId);
	const LanguageModel = createWebLlmLanguageModel(model.mlcModelId);

	logResolved('webllm', model.mlcModelId);
	return { kind: 'webllm', LanguageModel, mlcModelId: model.mlcModelId };
}

function resolveEndpoint(config: InferenceEndpointConfig): ResolvedProvider {
	const LanguageModel = createOpenAiCompatibleLanguageModel(config);

	logResolved('openai', config.model);
	return { kind: 'openai', LanguageModel, endpointModelId: config.model };
}

/**
 * The only way to tell from the outside which backend actually got picked — the manual verification
 * checklist relies on it, since a GPU-less CI can never exercise this path.
 */
function logResolved(kind: ProviderKind, detailId?: string): void {
	const detail = detailId ? ` (${detailId})` : '';
	console.info(`[riddlon/llm] inference backend: ${kind}${detail}`);
}

/** Drops the memo so the next resolve re-reads the catalog. Call when the model choice changes. */
export function resetProvider(): void {
	cached = undefined;
	inFlight = undefined;
}
