import type { EngineEffect, EngineState } from './state.js';

export { confirmedSourceCount } from './state.js';

/** Words that only phrase a value — "gegen 22 Uhr", "ca. 22 Uhr" and "22 Uhr" say the same. */
// prettier-ignore
const PHRASING_WORDS = new Set([
	'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'und',
	'gegen', 'ca', 'circa', 'etwa', 'ungefähr', 'so', 'um', 'am', 'an', 'im', 'in', 'auf', 'bei',
	'aus', 'zu', 'zur', 'zum', 'von', 'vom', 'mit', 'war', 'ist', 'hat', 'hatte', 'hing', 'lag',
	'er', 'sie', 'es', 'ihre', 'ihr', 'sein', 'seine', 'jemand', 'irgendwer', 'wohl', 'vielleicht'
]);

/** Words that flip a statement: "war an der Garderobe" and "war nicht an der Garderobe" differ. */
const NEGATIONS = new Set([
	'nicht',
	'kein',
	'keine',
	'keinen',
	'keinem',
	'keiner',
	'nie',
	'niemand'
]);

interface ValueShape {
	normalized: string;
	terms: Set<string>;
	negated: boolean;
}

function valueShape(value: string): ValueShape {
	const normalized = value
		.toLowerCase()
		.replace(/[’'`´]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
	const terms = new Set<string>();
	let negated = false;
	for (const word of normalized.split(' ')) {
		if (!word) continue;
		if (NEGATIONS.has(word)) negated = !negated;
		else if (!PHRASING_WORDS.has(word)) terms.add(stem(word));
	}
	return { normalized, terms, negated };
}

/** A rough German stem, so inflection ("dunkle" / "dunkler") does not read as a different value. */
function stem(word: string): string {
	if (word.length <= 4) return word;
	return word.replace(/(en|er|em|es|e|n|s)$/, '');
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
	for (const term of a) if (!b.has(term)) return false;
	return true;
}

/**
 * Whether two claimed values say the same thing (#54). Claims are free text from a language model,
 * so an exact string comparison made "gegen 22 Uhr" and "ca. 22 Uhr" a contradiction. Two values
 * agree when they negate alike and one's content words are contained in the other's — "an der
 * Garderobe" agrees with "die Jacke hing an der Garderobe", "22 Uhr" does not agree with
 * "Mitternacht". Deliberately conservative: it only merges what is plainly the same statement.
 */
export function claimValuesAgree(a: string, b: string): boolean {
	const left = valueShape(a);
	const right = valueShape(b);
	if (left.negated !== right.negated) return false;
	if (left.terms.size === 0 || right.terms.size === 0) return left.normalized === right.normalized;
	return isSubset(left.terms, right.terms) || isSubset(right.terms, left.terms);
}

/** How many different statements the claims make — equivalent phrasings count once. */
function distinctValueCount(claims: { value: string }[]): number {
	const representatives: string[] = [];
	for (const { value } of claims) {
		if (!representatives.some((known) => claimValuesAgree(known, value))) {
			representatives.push(value);
		}
	}
	return representatives.length;
}

/** docs/arc42 §8.1.5 / #8: ≥2 claimed values for the same clue that do not agree. */
export function isClueConflicting(state: EngineState, clueId: string): boolean {
	const clue = state.clues[clueId];
	if (!clue) return false;
	return distinctValueCount(clue.claims) >= 2;
}

/**
 * Records one source's claim about a clue. Never overwrites an earlier claim — every
 * distinct (characterId, value) pair persists (the #8 acceptance criterion) — but a repeat
 * of an already-recorded claim by the same source, in any phrasing that agrees with it, is
 * a no-op, not a duplicate entry.
 */
export function recordClueClaim(
	state: EngineState,
	clueId: string,
	characterId: string,
	value: string
): EngineEffect[] {
	const clue = (state.clues[clueId] ??= { clueId, claims: [], resolved: false });

	const alreadyRecorded = clue.claims.some(
		(claim) => claim.characterId === characterId && claimValuesAgree(claim.value, value)
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
