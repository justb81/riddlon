/**
 * What a single row in the settings model list should say, derived from `llm` store state — pulled
 * out as a pure function so the list's logic is Node-testable (see CLAUDE.md's "pure logic" rule).
 *
 * The list is read-only: the player never picks a model (see `capabilities.ts`'s
 * `bestSupportedModelId`), so every row only ever reports what the app already decided — which
 * backend actually won, and, since both a native Prompt API and a WebLLM catalog model can have a
 * real first-run download, which one (if any) is currently downloading/preparing. The `'gemini'`
 * row (issue #84) is the one exception with no download at all — it is either unusable for lack of
 * a stored key, or active immediately.
 */

import type { LlmErrorCode } from './errors.js';
import type { LocalModelId } from './catalog.js';
import type { LlmStatus, ProviderKind } from './types.js';

/**
 * `'native'` and `'gemini'` are the two synthetic rows (the browser's built-in Prompt API, and the
 * BYOK cloud fallback); the rest are catalog ids.
 */
export type ModelRowKind = 'native' | 'gemini' | LocalModelId;

export type ModelRowStatus =
	/** Capabilities haven't been probed yet. */
	| { kind: 'checking' }
	/** Native row only: this browser has no Prompt API at all. */
	| { kind: 'unavailable' }
	/** WebLLM row only: this device can't run the model (no WebGPU, or not enough VRAM). */
	| { kind: 'unsupported'; reason: LlmErrorCode }
	/** Gemini row only: no API key has been stored in settings yet. */
	| { kind: 'key-missing' }
	| { kind: 'downloading'; percent: number }
	| { kind: 'preparing'; percent: number }
	/** This row is the backend actually in use right now. */
	| { kind: 'active' }
	/** Supported in principle, but not the one currently in use. */
	| { kind: 'inactive' };

export interface ModelRowInput {
	kind: ModelRowKind;
	backend: ProviderKind | null;
	activeModelId: LocalModelId | null;
	loadingModelId: LocalModelId | null;
	status: LlmStatus;
	progress: number;
	/** `undefined` while capabilities haven't been probed yet (`llm.capabilities === null`). */
	hasNativeLanguageModel: boolean | undefined;
	/** WebLLM rows only: `undefined` when this model can run here (or capabilities are unknown yet). */
	unsupportedReason: LlmErrorCode | undefined;
	/** Gemini row only: whether a key is currently stored (see `gemini-key.ts`). */
	hasGeminiApiKey: boolean;
}

export function modelRowStatus(input: ModelRowInput): ModelRowStatus {
	if (input.hasNativeLanguageModel === undefined) return { kind: 'checking' };

	if (input.kind === 'native') {
		if (!input.hasNativeLanguageModel) return { kind: 'unavailable' };
		if (input.backend !== 'native') return { kind: 'inactive' };
		return backendProgressOrActive(input);
	}

	if (input.kind === 'gemini') {
		// Same precedence as the WebLLM row: native wins outright, regardless of a stored key.
		if (input.hasNativeLanguageModel) return { kind: 'inactive' };
		if (!input.hasGeminiApiKey) return { kind: 'key-missing' };
		if (input.backend !== 'gemini') return { kind: 'inactive' };
		return backendProgressOrActive(input);
	}

	// A WebLLM catalog row is only ever a candidate once native is known to be absent — native wins
	// regardless of which catalog model is selected (see `provider.ts`'s `resolveFresh`).
	if (input.hasNativeLanguageModel) return { kind: 'inactive' };
	if (input.unsupportedReason) return { kind: 'unsupported', reason: input.unsupportedReason };
	if (input.loadingModelId === input.kind) return backendProgressOrActive(input);
	if (input.activeModelId === input.kind && input.status === 'ready') return { kind: 'active' };
	return { kind: 'inactive' };
}

function backendProgressOrActive(
	input: Pick<ModelRowInput, 'status' | 'progress'>
): ModelRowStatus {
	const percent = Math.round(Math.max(0, Math.min(1, input.progress)) * 100);
	if (input.status === 'downloading') return { kind: 'downloading', percent };
	if (input.status === 'preparing') return { kind: 'preparing', percent };
	if (input.status === 'ready') return { kind: 'active' };
	return { kind: 'inactive' };
}
