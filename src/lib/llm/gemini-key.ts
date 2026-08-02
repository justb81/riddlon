/**
 * BYOK storage for the Gemini API key (issue #84's optional cloud fallback).
 *
 * A standalone module rather than a field on `profile.svelte.ts`, which is deliberately in-memory
 * only (see its own doc comment) — this key has to survive a reload, the same way a downloaded
 * model does, so a player who opted in doesn't have to re-enter it every session. It follows the
 * `riddlon:llm:*` localStorage convention `reset.ts` already uses for the WebLLM cache markers.
 */

import { browser } from '$app/environment';

/** Exported so `state/reset.ts` can carve it back out of the `riddlon:llm:*` markers it keeps. */
export const GEMINI_KEY_STORAGE_KEY = 'riddlon:llm:gemini-key';
const STORAGE_KEY = GEMINI_KEY_STORAGE_KEY;

export function getGeminiApiKey(): string | undefined {
	if (!browser) return undefined;
	try {
		return localStorage.getItem(STORAGE_KEY) ?? undefined;
	} catch {
		return undefined;
	}
}

/** Convenience for call sites that only need to know whether a fallback is configured at all. */
export function hasGeminiApiKey(): boolean {
	return Boolean(getGeminiApiKey());
}

export function setGeminiApiKey(key: string): void {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, key);
	} catch {
		// Private mode or a full quota: the key just won't survive reload, same tradeoff as
		// `model-cache.ts`'s cache marker.
	}
}

export function clearGeminiApiKey(): void {
	if (!browser) return;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Nothing to do — there was nothing durable to begin with.
	}
}
