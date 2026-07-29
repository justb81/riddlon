/**
 * Public surface of the local-inference module (docs/concept.md §3.2).
 *
 * Everything the story engine and UI need is here. Nothing outside this directory may import
 * `prompt-api-polyfill` or `@mlc-ai/web-llm` — `no-backend-leakage.spec.ts` enforces that, and it's
 * what keeps "swap the model" a config change (issue #12, AC 1).
 *
 * The `llm` runes singleton is deliberately not re-exported: it lives in `llm.svelte.ts` and is
 * imported directly, matching how `$lib/state/*.svelte.ts` stores are consumed elsewhere.
 */

export { createLlmAdapter, modelVramRequiredMB } from './adapter.js';
export {
	canRunModel,
	detectLlmCapabilities,
	type LlmCapabilities
} from './capabilities.js';
export {
	isMeteredConnection,
	resolveBackend,
	shouldAutoStartDownload,
	type BackendChoice,
	type DeviceFacts
} from './capabilities-rules.js';
export {
	DEFAULT_MODEL_ID,
	LLM_MODELS,
	MODEL_ORDER,
	findModel,
	formatSizeLabel,
	isLocalModelId,
	llmModelOptions,
	type LlmModelDescriptor,
	type LocalModelId
} from './catalog.js';
export {
	LlmError,
	classifyLoadError,
	i18nKeyForLlmError,
	isLlmError,
	type LlmErrorCode
} from './errors.js';
export { deleteModel, isModelCached, markModelCached } from './model-cache.js';
export {
	PHASE_BUDGET,
	PREPARE_THRESHOLD,
	percentForModelLoad,
	percentForPhase
} from './progress.js';
export { resetProvider, resolveProvider } from './provider.js';
export type {
	LlmAdapter,
	LlmAdapterConfig,
	LlmAvailability,
	LlmProgress,
	LlmSession,
	LlmSessionConfig,
	LlmStatus,
	LlmTurn,
	ProviderKind
} from './types.js';
