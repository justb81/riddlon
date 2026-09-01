/**
 * Public surface of the local-inference module (docs/arc42 §5.1).
 *
 * Everything the story engine and UI need is here. Nothing outside this directory may import
 * `@mlc-ai/web-llm` — `no-backend-leakage.spec.ts` enforces that, and it's what keeps "swap the
 * model" a config change (issue #12, AC 1).
 *
 * The `llm` runes singleton is deliberately not re-exported: it lives in `llm.svelte.ts` and is
 * imported directly, matching how `$lib/state/*.svelte.ts` stores are consumed elsewhere.
 */

export { createLlmAdapter } from './adapter.js';
export {
	bestSupportedModelId,
	canRunModel,
	detectLlmCapabilities,
	unsupportedModelReason,
	type LlmCapabilities
} from './capabilities.js';
export {
	isMeteredConnection,
	shouldAutoStartDownload,
	type DeviceFacts
} from './capabilities-rules.js';
export {
	DEFAULT_MODEL_ID,
	LLM_MODELS,
	MODEL_ORDER,
	findModel,
	formatSizeLabel,
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
export {
	ENDPOINT_STORAGE_KEY,
	clearEndpointConfig,
	endpointHostLabel,
	getEndpointConfig,
	hasEndpointConfig,
	isLocalEndpoint,
	normalizeBaseUrl,
	setEndpointConfig,
	type InferenceEndpointConfig
} from './endpoint-config.js';
export { createOpenAiCompatibleLanguageModel, testEndpoint } from './openai-compatible.js';
export { isModelCached, markModelCached } from './model-cache.js';
export { modelRowStatus, type ModelRowInput, type ModelRowStatus } from './model-status.js';
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
