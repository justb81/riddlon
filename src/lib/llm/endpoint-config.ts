/**
 * Where a player-supplied, OpenAI-compatible inference endpoint is stored.
 *
 * A standalone module rather than a field on `profile.svelte.ts`, which is deliberately in-memory
 * only (see its own doc comment) — this has to survive a reload, the same way a downloaded model
 * does, so a player who set up an endpoint doesn't have to re-enter it every session. It follows
 * the `riddlon:llm:*` localStorage convention `reset.ts` already uses for the WebLLM cache markers,
 * and, because it can carry an API key, is carved back out of the markers `reset.ts` preserves.
 *
 * Everything except the four storage functions is pure, so the parsing and URL rules below are
 * Node-testable (`endpoint-config.spec.ts`) rather than only reachable through a browser.
 */

import { browser } from '$app/environment';

export interface InferenceEndpointConfig {
	/** OpenAI-style API root, e.g. `http://localhost:11434/v1`. No trailing slash. */
	baseUrl: string;
	/** Whatever the server calls the model, e.g. `llama3.2` or `gpt-4o-mini`. */
	model: string;
	/** Optional: a llama.cpp or Ollama server on the same machine usually wants no key at all. */
	apiKey?: string;
}

/** Exported so `state/reset.ts` can carve it back out of the `riddlon:llm:*` markers it keeps. */
export const ENDPOINT_STORAGE_KEY = 'riddlon:llm:endpoint';
const STORAGE_KEY = ENDPOINT_STORAGE_KEY;

/** Hosts that never leave the machine or the local network, for the settings privacy note. */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);
const PRIVATE_IPV4 = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

/**
 * Tidies what a player pasted: a trailing slash, and the full `/chat/completions` path that is the
 * obvious thing to copy out of a provider's docs even though we append it ourselves.
 */
export function normalizeBaseUrl(url: string): string {
	let trimmed = url.trim();
	while (trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1);
	if (trimmed.endsWith('/chat/completions')) {
		trimmed = trimmed.slice(0, -'/chat/completions'.length);
	}
	while (trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1);
	return trimmed;
}

/**
 * A stored record, or `undefined` when there isn't a usable one.
 *
 * Both `baseUrl` and `model` are required: a half-filled settings form must not count as
 * configured, or an empty endpoint would outrank a local model that actually works (see
 * `provider.ts`, where a configured endpoint wins outright).
 */
export function parseEndpointConfig(raw: string | null): InferenceEndpointConfig | undefined {
	if (!raw) return undefined;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}

	if (typeof parsed !== 'object' || parsed === null) return undefined;
	const record = parsed as Record<string, unknown>;

	const baseUrl = typeof record.baseUrl === 'string' ? normalizeBaseUrl(record.baseUrl) : '';
	const model = typeof record.model === 'string' ? record.model.trim() : '';
	if (!baseUrl || !model) return undefined;

	const apiKey = typeof record.apiKey === 'string' ? record.apiKey.trim() : '';
	return apiKey ? { baseUrl, model, apiKey } : { baseUrl, model };
}

/** Host (with port) for the settings status line — falls back to the raw string if unparseable. */
export function endpointHostLabel(baseUrl: string): string {
	try {
		return new URL(baseUrl).host;
	} catch {
		return baseUrl;
	}
}

/**
 * Whether requests to this endpoint stay on the device or the local network.
 *
 * Drives which privacy note the settings screen shows: an Ollama on the same machine sends nothing
 * anywhere, `api.openai.com` sends every chat message to a third party. Telling the player which of
 * the two they picked is the whole reason this distinction is made rather than warning about both.
 */
export function isLocalEndpoint(baseUrl: string): boolean {
	let hostname: string;
	try {
		hostname = new URL(baseUrl).hostname.toLowerCase();
	} catch {
		return false;
	}

	if (LOCAL_HOSTNAMES.has(hostname)) return true;
	if (hostname.endsWith('.local') || hostname.endsWith('.localhost')) return true;
	return PRIVATE_IPV4.test(hostname);
}

export function getEndpointConfig(): InferenceEndpointConfig | undefined {
	if (!browser) return undefined;
	try {
		return parseEndpointConfig(localStorage.getItem(STORAGE_KEY));
	} catch {
		return undefined;
	}
}

/** Convenience for call sites that only need to know whether an endpoint is configured at all. */
export function hasEndpointConfig(): boolean {
	return getEndpointConfig() !== undefined;
}

export function setEndpointConfig(config: InferenceEndpointConfig): void {
	if (!browser) return;
	const normalized: InferenceEndpointConfig = {
		baseUrl: normalizeBaseUrl(config.baseUrl),
		model: config.model.trim(),
		...(config.apiKey?.trim() ? { apiKey: config.apiKey.trim() } : {})
	};
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
	} catch {
		// Private mode or a full quota: the endpoint just won't survive a reload, same tradeoff as
		// `model-cache.ts`'s cache marker.
	}
}

export function clearEndpointConfig(): void {
	if (!browser) return;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Nothing to do — there was nothing durable to begin with.
	}
}
