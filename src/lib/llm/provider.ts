/**
 * Native first, direct WebLLM second — and the only file in the app that knows either exists.
 *
 * The WebLLM path used to go through `prompt-api-polyfill`, whose own backend rebuilt the whole
 * `MLCEngine` on every logical session (issue #69). `webllm-direct.ts` now owns one persistent
 * engine instead, so this file's only remaining job is the native-vs-WebLLM choice: probe
 * `globalThis.LanguageModel` for a real built-in implementation, and fall back to WebLLM when
 * there isn't one. `LanguageModel` is still read as a global rather than declared here on
 * `Window`, since a native implementation is the browser's own, not something this module installs.
 */

import { browser } from '$app/environment';
import { findModel, type LocalModelId } from './catalog.js';
import { LlmError } from './errors.js';
import { createWebLlmLanguageModel } from './webllm-direct.js';
import type { LanguageModelLike, ResolvedProvider } from './types.js';

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
 * session, which a device with a native Prompt API would otherwise always shadow) — skips
 * `resolveNative()` so `resolveFresh` falls straight through to the polyfill. Never surfaced to
 * the player; only `/dev/llm` sets it. Caller must `resetProvider()` after flipping it, same as
 * any other change that should affect the next resolve.
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
