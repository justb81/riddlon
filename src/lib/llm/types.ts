/**
 * The seam between the story/UI layers and whatever actually runs the model.
 *
 * The interface here is deliberately a thin re-shaping of the W3C/Chrome Prompt API rather than a
 * vocabulary of our own: `engine/` and `ui/` code against `LlmAdapter`/`LlmSession`, and the two
 * concrete providers (the browser's built-in `LanguageModel`, or the WebLLM-backed polyfill) both
 * arrive as the same `LanguageModelLike` shape. Swapping either the model or the provider therefore
 * touches nothing outside `$lib/llm` — see `no-backend-leakage.spec.ts`, which enforces that.
 *
 * The Prompt API types below are structural on purpose (no `declare global`): that's what lets the
 * specs inject a fake provider and exercise the real adapter in Node, with no WebGPU anywhere.
 */

import type { LocalModelId } from './catalog.js';

/* -------------------------------------------------------------------------- */
/* The subset of the Prompt API we depend on                                  */
/* -------------------------------------------------------------------------- */

/** Per the Prompt API spec; the WebLLM polyfill only ever reports 'available' or 'unavailable'. */
export type PromptApiAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

export interface PromptApiMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface PromptApiCreateOptions {
	initialPrompts?: readonly PromptApiMessage[];
	temperature?: number;
	topK?: number;
	signal?: AbortSignal;
	/**
	 * Called once with an `EventTarget` that emits `ProgressEvent('downloadprogress')` with
	 * `loaded` in 0..1. This is the only progress signal the polyfill exposes.
	 */
	monitor?: (target: EventTarget) => void;
}

export interface PromptApiPromptOptions {
	signal?: AbortSignal;
}

export interface LanguageModelSessionLike {
	prompt(input: string, options?: PromptApiPromptOptions): Promise<string>;
	promptStreaming(input: string, options?: PromptApiPromptOptions): ReadableStream<string>;
	destroy(): void;
}

export interface LanguageModelLike {
	availability(options?: Record<string, unknown>): Promise<PromptApiAvailability>;
	create(options?: PromptApiCreateOptions): Promise<LanguageModelSessionLike>;
}

/** Which implementation backs `LanguageModelLike` right now. */
export type ProviderKind = 'native' | 'polyfill';

export interface ResolvedProvider {
	kind: ProviderKind;
	LanguageModel: LanguageModelLike;
	/** The concrete model the provider was configured with; `undefined` for the built-in model. */
	mlcModelId?: string;
}

/* -------------------------------------------------------------------------- */
/* Our own surface                                                            */
/* -------------------------------------------------------------------------- */

export type LlmStatus = 'idle' | 'checking' | 'downloading' | 'preparing' | 'ready' | 'error';

/** 'ready' = usable now; 'downloadable' = usable after a download; 'unsupported' = never. */
export type LlmAvailability = 'ready' | 'downloadable' | 'unsupported';

export interface LlmProgress {
	phase: 'download' | 'prepare';
	/** 0..1, monotonic across a single load. */
	fraction: number;
}

export interface LlmTurn {
	role: 'user' | 'assistant';
	content: string;
}

export interface LlmSessionConfig {
	/**
	 * Opaque to this module — persona, canon facts and safety rules are the caller's business.
	 * The prompt-template schema is an open point in docs/concept.md §9, so nothing here
	 * interprets this string.
	 */
	systemPrompt: string;
	seedTurns?: readonly LlmTurn[];
	temperature?: number;
	topK?: number;
	/** Turns kept when a session has to be rebuilt. Older ones are dropped, oldest first. */
	maxHistoryTurns?: number;
}

export interface LlmSession {
	/** Caller-chosen identity, e.g. a thread id. Stable across underlying rebuilds. */
	readonly key: string;
	readonly modelId: LocalModelId;
	/** Everything said so far, owned by us rather than the backend, so a rebuild can replay it. */
	readonly turns: readonly LlmTurn[];
	prompt(text: string, opts?: { signal?: AbortSignal }): Promise<string>;
	/** Yields *deltas*, not cumulative snapshots. */
	stream(text: string, opts?: { signal?: AbortSignal }): AsyncIterable<string>;
	destroy(): Promise<void>;
}

export interface LlmAdapterConfig {
	modelId: LocalModelId;
	/**
	 * 'session' gives every logical session its own backend handle. 'inline' shares one handle and
	 * renders persona + history into each prompt instead — necessary for the polyfill, where a
	 * second `create()` means a full engine rebuild. Defaults per provider kind.
	 */
	personaMode?: 'session' | 'inline';
	maxLiveSessions?: number;
}

export interface LlmAdapter {
	readonly modelId: LocalModelId;
	availability(): Promise<LlmAvailability>;
	/** Loads the model, reporting progress. Creates the one warm backend handle. */
	load(opts?: { onProgress?: (p: LlmProgress) => void; signal?: AbortSignal }): Promise<void>;
	/**
	 * The session for `key`, created on first use. Calling it again with the same key returns the
	 * *same* conversation but adopts the new `config` — a character's persona changes as the story
	 * advances, while their chat history does not. `seedTurns` only applies to the first call.
	 */
	createSession(key: string, config: LlmSessionConfig): Promise<LlmSession>;
	dispose(): Promise<void>;
}

export interface AdapterDeps {
	resolveProvider: (modelId: LocalModelId) => Promise<ResolvedProvider>;
}
