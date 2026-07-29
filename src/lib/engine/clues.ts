import type { EngineEffect, EngineState } from './state.js';

export { confirmedSourceCount } from './state.js';

function distinctValueCount(claims: { value: string }[]): number {
	return new Set(claims.map((claim) => claim.value)).size;
}

/** docs/concept.md §5.5 / #8: ≥2 distinct claimed values for the same clue. */
export function isClueConflicting(state: EngineState, clueId: string): boolean {
	const clue = state.clues[clueId];
	if (!clue) return false;
	return distinctValueCount(clue.claims) >= 2;
}

/**
 * Records one source's claim about a clue. Never overwrites an earlier claim — every
 * distinct (characterId, value) pair persists (the #8 acceptance criterion) — but an
 * exact repeat of an already-recorded claim is a no-op, not a duplicate entry.
 */
export function recordClueClaim(
	state: EngineState,
	clueId: string,
	characterId: string,
	value: string
): EngineEffect[] {
	const clue = (state.clues[clueId] ??= { clueId, claims: [], resolved: false });

	const alreadyRecorded = clue.claims.some(
		(claim) => claim.characterId === characterId && claim.value === value
	);
	if (alreadyRecorded) return [];

	const wasConflicting = distinctValueCount(clue.claims) >= 2;
	clue.claims.push({ characterId, value });
	const effects: EngineEffect[] = [{ type: 'clue-recorded', clueId, characterId, value }];

	if (!wasConflicting && distinctValueCount(clue.claims) >= 2) {
		// A newly-detected contradiction is unresolved by definition, even if a previous
		// (now superseded) conflict on this clue had already been resolved.
		clue.resolved = false;
		effects.push({ type: 'clue-conflict-detected', clueId });
	}

	return effects;
}

/** Marks a conflicting clue as resolved by the engine/UI — idempotent, no-op if already resolved. */
export function resolveClue(state: EngineState, clueId: string): EngineEffect[] {
	const clue = state.clues[clueId];
	if (!clue || clue.resolved) return [];
	clue.resolved = true;
	return [{ type: 'clue-resolved', clueId }];
}
