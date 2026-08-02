/**
 * Every way local inference can fail, normalised into a small closed set so the UI can render a
 * German sentence for each instead of leaking a raw `DOMException` at the player.
 *
 * `errors.spec.ts` asserts that every code here has a matching key in de.json, so the table and the
 * dictionary can't drift apart.
 */

export type LlmErrorCode =
	| 'no-webgpu'
	| 'insufficient-vram'
	| 'offline'
	| 'download-failed'
	| 'compile-failed'
	| 'oom'
	| 'aborted'
	| 'unsupported-model'
	| 'invalid-api-key'
	| 'quota-exceeded'
	| 'unknown';

export interface LlmErrorOptions {
	cause?: unknown;
	/** For 'aborted': whatever had already been generated when the caller pulled the plug. */
	partial?: string;
}

export class LlmError extends Error {
	readonly code: LlmErrorCode;
	readonly partial?: string;

	constructor(code: LlmErrorCode, options: LlmErrorOptions = {}) {
		super(`llm: ${code}`, { cause: options.cause });
		this.name = 'LlmError';
		this.code = code;
		this.partial = options.partial;
	}
}

export function isLlmError(value: unknown): value is LlmError {
	return value instanceof LlmError;
}

/** i18n key for the human-facing message. Keys live under `llm.error.*` in de.json. */
export function i18nKeyForLlmError(code: LlmErrorCode): string {
	return `llm.error.${code}`;
}

const OOM_PATTERN = /out of memory|allocation failed|exceeds the limit|buffer size/i;
const COMPILE_PATTERN = /device.?lost|shader|compil|createComputePipeline|validation/i;
const NETWORK_PATTERN = /fetch|network|failed to load|err_|http|cache/i;

/**
 * Best-effort classification of whatever a provider threw during load or generation.
 *
 * Order matters: an abort is not a failure, OOM is checked before the compile patterns (a
 * device-lost caused by an allocation should read as OOM, which is the one the player can act on by
 * picking the smaller model), and the network catch-all comes last so it can't swallow the others.
 */
export function classifyLoadError(error: unknown): LlmErrorCode {
	if (isLlmError(error)) return error.code;

	if (error instanceof DOMException) {
		if (error.name === 'AbortError') return 'aborted';
		if (error.name === 'NotSupportedError') return 'no-webgpu';
		if (error.name === 'QuotaExceededError') return 'oom';
	}

	const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? '');

	if (/abort/i.test(message)) return 'aborted';
	if (OOM_PATTERN.test(message)) return 'oom';
	if (/webgpu|navigator\.gpu|requestAdapter/i.test(message)) return 'no-webgpu';
	if (COMPILE_PATTERN.test(message)) return 'compile-failed';
	if (NETWORK_PATTERN.test(message)) return 'download-failed';

	return 'unknown';
}
