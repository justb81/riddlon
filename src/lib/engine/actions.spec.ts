import { describe, expect, it } from 'vitest';
import { parseAction } from './actions.js';

describe('parseAction', () => {
	it('parses the docs/concept.md §5.6 example, "unlock-scene:scene-lucy-suspicion"', () => {
		expect(parseAction('unlock-scene:scene-lucy-suspicion')).toEqual({
			type: 'unlock-scene',
			sceneId: 'scene-lucy-suspicion'
		});
	});

	it('parses "set-flag:<name>"', () => {
		expect(parseAction('set-flag:hans-info-confirmed')).toEqual({
			type: 'set-flag',
			flag: 'hans-info-confirmed'
		});
	});

	it('parses "unlock-character:<uuid>"', () => {
		expect(parseAction('unlock-character:8b6d2f10-4c3a-4a91-9e2b-2f4a6b8c1d3e')).toEqual({
			type: 'unlock-character',
			characterId: '8b6d2f10-4c3a-4a91-9e2b-2f4a6b8c1d3e'
		});
	});

	it('returns undefined for an unrecognized prefix rather than throwing', () => {
		expect(parseAction('mystery-action:whatever')).toBeUndefined();
	});

	it('returns undefined for a bare string with no colon', () => {
		expect(parseAction('nonsense')).toBeUndefined();
	});

	it('returns undefined for an empty payload after the colon', () => {
		expect(parseAction('unlock-scene:')).toBeUndefined();
	});
});
