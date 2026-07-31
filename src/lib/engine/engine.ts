import type { StoryBundle } from '$lib/content/index.js';
import type { EngineAction } from './actions.js';
import * as clues from './clues.js';
import { armDueEvents, fireDueEvents } from './delayed-events.js';
import {
	isCharacterVisible,
	maskedCharacterIds,
	progress,
	recompute,
	visibleCharacterIds,
	type ProgressSummary
} from './graph.js';
import {
	applyEngineAction,
	createInitialState,
	type EngineEffect,
	type EngineState
} from './state.js';

export interface StoryEngineOptions {
	/** Resume from previously-persisted state instead of starting a fresh playthrough. */
	state?: EngineState;
	/** Injectable for deterministic tests; defaults to the real wall clock. */
	clock?: () => number;
}

/**
 * The story-engine facade (docs/concept.md §5.4-§5.6, issues #7/#8/#9): a deterministic
 * state machine over one `StoryBundle`, with zero dependency on any LLM backend — it only
 * decides *what's allowed to happen*, never what a character says. Every mutating method
 * returns the `EngineEffect[]` it produced; `ui/` and the future `llm/` module observe the
 * engine purely through those effects and the read-only `progress()`/`visibleCharacterIds()`
 * queries, never by diffing `state` themselves.
 */
export class StoryEngine {
	readonly bundle: StoryBundle;
	readonly state: EngineState;
	private readonly clock: () => number;

	constructor(bundle: StoryBundle, options: StoryEngineOptions = {}) {
		this.bundle = bundle;
		this.state = options.state ?? createInitialState(bundle);
		this.clock = options.clock ?? (() => Date.now());
		// An engine's very first "app open" is itself a resume: it unlocks any
		// zero-entryCondition scenes and arms any already-eligible delayed events.
		this.resume();
	}

	private advance(now: number): EngineEffect[] {
		return [...recompute(this.state, this.bundle), ...armDueEvents(this.state, this.bundle, now)];
	}

	setFlag(flag: string, now: number = this.clock()): EngineEffect[] {
		return [...applyEngineAction(this.state, { type: 'set-flag', flag }), ...this.advance(now)];
	}

	recordClueClaim(
		clueId: string,
		characterId: string,
		value: string,
		now: number = this.clock()
	): EngineEffect[] {
		return [...clues.recordClueClaim(this.state, clueId, characterId, value), ...this.advance(now)];
	}

	resolveClue(clueId: string, now: number = this.clock()): EngineEffect[] {
		return [...clues.resolveClue(this.state, clueId), ...this.advance(now)];
	}

	applyAction(action: EngineAction, now: number = this.clock()): EngineEffect[] {
		return [...applyEngineAction(this.state, action), ...this.advance(now)];
	}

	/**
	 * Call on every app open/resume/foreground (#9) — fires any delayed events whose
	 * `approxDelay` has elapsed since arming, then recomputes graph state and arms any
	 * newly-eligible events. Fired events never fire twice (`pending.fired` is sticky).
	 */
	resume(now: number = this.clock()): EngineEffect[] {
		return [...fireDueEvents(this.state, this.bundle, now), ...this.advance(now)];
	}

	progress(): ProgressSummary {
		return progress(this.state, this.bundle);
	}

	visibleCharacterIds(): Set<string> {
		return visibleCharacterIds(this.bundle, this.state);
	}

	isCharacterVisible(characterId: string): boolean {
		return isCharacterVisible(characterId, this.bundle, this.state);
	}

	maskedCharacterIds(): Set<string> {
		return maskedCharacterIds(this.bundle, this.state);
	}
}
