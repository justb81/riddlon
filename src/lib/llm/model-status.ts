/**
 * What a single row in the settings model list should say, derived from `llm` store state — pulled
 * out as a pure function so the list's logic is Node-testable (see CLAUDE.md's "pure logic" rule).
 *
 * The list is read-only: the player never picks a *model* (see `capabilities.ts`'s
 * `bestSupportedModelId`), so every row only ever reports what the app already decided — which
 * backend actually won, and, since both a native Prompt API and a WebLLM catalog model can have a
 * real first-run download, which one (if any) is currently downloading/preparing. The `'openai'`
 * row is the one exception with no download at all — it is either unconfigured, or active
 * immediately. It is also the one row the player *does* control, and it outranks the other two:
 * a configured endpoint wins in `provider.ts`, so the local rows drop to `inactive` behind it.
 */

import type { LlmErrorCode } from './errors.js';
import type { LocalModelId } from './catalog.js';
import type { LlmStatus, ProviderKind } from './types.js';

/**
 * `'native'` and `'openai'` are the two synthetic rows (the browser's built-in Prompt API, and the
 * player-configured endpoint); the rest are catalog ids.
 */
export type ModelRowKind = 'native' | 'openai' | LocalModelId;

export type ModelRowStatus =
	/** Capabilities haven't been probed yet. */
	| { kind: 'checking' }
	/** Native row only: this browser has no Prompt API at all. */
	| { kind: 'unavailable' }
	/** WebLLM row only: this device can't run the model (no WebGPU, or not enough VRAM). */
	| { kind: 'unsupported'; reason: LlmErrorCode }
	/** Endpoint row only: no base URL + model name has been entered in settings yet. */
	| { kind: 'not-configured' }
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
	/** Endpoint row only: whether a usable configuration is stored (see `endpoint-config.ts`). */
	hasEndpointConfig: boolean;
}

export function modelRowStatus(input: ModelRowInput): ModelRowStatus {
	if (input.hasNativeLanguageModel === undefined) return { kind: 'checking' };

	if (input.kind === 'openai') {
		if (!input.hasEndpointConfig) return { kind: 'not-configured' };
		if (input.backend !== 'openai') return { kind: 'inactive' };
		return backendProgressOrActive(input);
	}

	if (input.kind === 'native') {
		// "This browser has no Prompt API" is worth saying even behind a configured endpoint, so the
		// diagnosis comes before the precedence check.
		if (!input.hasNativeLanguageModel) return { kind: 'unavailable' };
		if (input.hasEndpointConfig) return { kind: 'inactive' };
		if (input.backend !== 'native') return { kind: 'inactive' };
		return backendProgressOrActive(input);
	}

	// A WebLLM catalog row is only ever a candidate once nothing above it won — an endpoint, then
	// native, both beat it regardless of which catalog model is selected (`provider.ts`'s
	// `resolveFresh`). Same reasoning as above: report *why* it could never run before reporting
	// that something else is running instead.
	if (input.unsupportedReason) return { kind: 'unsupported', reason: input.unsupportedReason };
	if (input.hasEndpointConfig) return { kind: 'inactive' };
	if (input.hasNativeLanguageModel) return { kind: 'inactive' };
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
