/**
 * Evaluates the single symbolicRef condition vocabulary shared by every conditional field
 * in the package format (docs/arc42 §8.1.4-§8.1.6): `entryConditions`, `exitConditions`,
 * `next[].when`, `outcomes[].condition`, `delayedEvents[].condition`, and
 * `castBindings[].availability.unlockCondition`. All are plain `symbolicRefSchema` strings
 * (`content/schemas/common.ts`) — colon-segmented predicates, no boolean operators beyond
 * `not:`.
 *
 * Unknown prefixes evaluate to `false` rather than throwing (a future/older package must
 * never hard-crash the player) but are collected in `evaluateAll`'s `unknownConditions` so
 * a caller (or a future authoring-studio linter) can surface them.
 */

export interface EvaluationContext {
	flags: Record<string, boolean>;
	unlockedSceneIds: ReadonlySet<string>;
	completedSceneIds: ReadonlySet<string>;
	/** clueId -> number of distinct character sources recorded so far. */
	clueSourceCounts: Record<string, number>;
	knownClueIds: ReadonlySet<string>;
	resolvedClueIds: ReadonlySet<string>;
	reachedOutcomeIds: ReadonlySet<string>;
	/** secretId -> its own revealCondition, so `secret-revealed:` can recurse into it. */
	secretRevealConditions: Record<string, string>;
}

export interface EvaluateAllResult {
	value: boolean;
	unknownConditions: string[];
}

function evaluateSingle(ref: string, ctx: EvaluationContext, unknown: Set<string>): boolean {
	if (ref === 'story-start') return true;

	const colonIndex = ref.indexOf(':');
	if (colonIndex === -1) {
		unknown.add(ref);
		return false;
	}
	const prefix = ref.slice(0, colonIndex);
	const rest = ref.slice(colonIndex + 1);

	switch (prefix) {
		case 'flag':
			// Flags are keyed by the full symbolic ref (e.g. "flag:max-questioned"), matching
			// how `saveStore`/`engine.setFlag` already store them — not by the bare suffix.
			return ctx.flags[ref] === true;
		case 'not':
			return !evaluateSingle(rest, ctx, unknown);
		case 'scene-unlocked':
			return ctx.unlockedSceneIds.has(rest);
		case 'scene-completed':
			return ctx.completedSceneIds.has(rest);
		case 'clue-known':
			return ctx.knownClueIds.has(rest);
		case 'clue-resolved':
			return ctx.resolvedClueIds.has(rest);
		case 'clue-confirmed': {
			const lastColon = rest.lastIndexOf(':');
			if (lastColon === -1) {
				unknown.add(ref);
				return false;
			}
			const clueId = rest.slice(0, lastColon);
			const requiredCount = Number(rest.slice(lastColon + 1));
			if (!Number.isFinite(requiredCount)) {
				unknown.add(ref);
				return false;
			}
			return (ctx.clueSourceCounts[clueId] ?? 0) >= requiredCount;
		}
		case 'secret-revealed': {
			const revealCondition = ctx.secretRevealConditions[rest];
			if (revealCondition === undefined) {
				unknown.add(ref);
				return false;
			}
			return evaluateSingle(revealCondition, ctx, unknown);
		}
		case 'outcome-reached':
			return ctx.reachedOutcomeIds.has(rest);
		default:
			unknown.add(ref);
			return false;
	}
}

export function evaluateCondition(ref: string, ctx: EvaluationContext): boolean {
	return evaluateSingle(ref, ctx, new Set());
}

/** `refs` all hold (AND semantics) — an empty list is vacuously true. */
export function evaluateAll(refs: readonly string[], ctx: EvaluationContext): EvaluateAllResult {
	const unknown = new Set<string>();
	let value = true;
	for (const ref of refs) {
		if (!evaluateSingle(ref, ctx, unknown)) value = false;
	}
	return { value, unknownConditions: [...unknown] };
}
