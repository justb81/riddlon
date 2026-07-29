import { describe, expect, it } from 'vitest';
import { evaluateAll, evaluateCondition, type EvaluationContext } from './conditions.js';

function baseContext(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
	return {
		flags: {},
		unlockedSceneIds: new Set(),
		completedSceneIds: new Set(),
		clueSourceCounts: {},
		knownClueIds: new Set(),
		resolvedClueIds: new Set(),
		reachedOutcomeIds: new Set(),
		secretRevealConditions: {},
		...overrides
	};
}

describe('evaluateCondition', () => {
	it('"story-start" is always true', () => {
		expect(evaluateCondition('story-start', baseContext())).toBe(true);
	});

	it('"flag:x" is true only when the flag is set', () => {
		const ctx = baseContext({ flags: { 'flag:max-questioned': true } });
		expect(evaluateCondition('flag:max-questioned', ctx)).toBe(true);
		expect(evaluateCondition('flag:sabine-questioned', ctx)).toBe(false);
	});

	it('"not:" negates its inner condition, including recursively', () => {
		const ctx = baseContext({ flags: { 'flag:a': true } });
		expect(evaluateCondition('not:flag:a', ctx)).toBe(false);
		expect(evaluateCondition('not:flag:b', ctx)).toBe(true);
		expect(evaluateCondition('not:not:flag:a', ctx)).toBe(true);
	});

	it('"scene-unlocked:" / "scene-completed:" read the respective sets', () => {
		const ctx = baseContext({
			unlockedSceneIds: new Set(['scene-1']),
			completedSceneIds: new Set(['scene-1'])
		});
		expect(evaluateCondition('scene-unlocked:scene-1', ctx)).toBe(true);
		expect(evaluateCondition('scene-unlocked:scene-2', ctx)).toBe(false);
		expect(evaluateCondition('scene-completed:scene-1', ctx)).toBe(true);
	});

	it('"clue-known:" / "clue-resolved:" read the respective sets', () => {
		const ctx = baseContext({
			knownClueIds: new Set(['clue:time-window']),
			resolvedClueIds: new Set(['clue:time-window'])
		});
		expect(evaluateCondition('clue-known:clue:time-window', ctx)).toBe(true);
		expect(evaluateCondition('clue-known:clue:other', ctx)).toBe(false);
		expect(evaluateCondition('clue-resolved:clue:time-window', ctx)).toBe(true);
	});

	it('"clue-confirmed:<clueId>:<n>" splits on the LAST colon, since clue ids contain colons', () => {
		const ctx = baseContext({ clueSourceCounts: { 'clue:time-window': 2 } });
		expect(evaluateCondition('clue-confirmed:clue:time-window:2', ctx)).toBe(true);
		expect(evaluateCondition('clue-confirmed:clue:time-window:3', ctx)).toBe(false);
	});

	it('"clue-confirmed:" with a non-numeric count is unknown, not a throw', () => {
		const ctx = baseContext();
		expect(evaluateCondition('clue-confirmed:clue:time-window:many', ctx)).toBe(false);
		expect(evaluateAll(['clue-confirmed:clue:time-window:many'], ctx).unknownConditions).toEqual([
			'clue-confirmed:clue:time-window:many'
		]);
	});

	it('"secret-revealed:" recurses into the secret\'s own revealCondition', () => {
		const ctx = baseContext({
			flags: { 'flag:report-to-lucy-done': true },
			secretRevealConditions: { 'secret:hans-tip': 'flag:report-to-lucy-done' }
		});
		expect(evaluateCondition('secret-revealed:secret:hans-tip', ctx)).toBe(true);
		expect(evaluateCondition('secret-revealed:secret:unknown', ctx)).toBe(false);
	});

	it('"outcome-reached:" reads the outcome set', () => {
		const ctx = baseContext({ reachedOutcomeIds: new Set(['max-confesses']) });
		expect(evaluateCondition('outcome-reached:max-confesses', ctx)).toBe(true);
	});

	it('an unrecognized prefix evaluates false and is reported as unknown', () => {
		const ctx = baseContext();
		expect(evaluateCondition('mystery:whatever', ctx)).toBe(false);
		const result = evaluateAll(['mystery:whatever'], ctx);
		expect(result.value).toBe(false);
		expect(result.unknownConditions).toEqual(['mystery:whatever']);
	});

	it('a bare string with no colon is unknown, not a throw', () => {
		const ctx = baseContext();
		expect(evaluateCondition('nonsense', ctx)).toBe(false);
	});
});

describe('evaluateAll', () => {
	it('is vacuously true for an empty list', () => {
		expect(evaluateAll([], baseContext())).toEqual({ value: true, unknownConditions: [] });
	});

	it('is true only when every condition holds (AND semantics)', () => {
		const ctx = baseContext({ flags: { 'flag:a': true } });
		expect(evaluateAll(['flag:a'], ctx).value).toBe(true);
		expect(evaluateAll(['flag:a', 'flag:b'], ctx).value).toBe(false);
	});

	it('collects every unknown condition across the list, not just the first', () => {
		const result = evaluateAll(['mystery:one', 'mystery:two'], baseContext());
		expect(result.unknownConditions).toEqual(['mystery:one', 'mystery:two']);
	});
});
