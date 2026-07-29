import { describe, expect, it } from 'vitest';
import { mentionsEvidence } from './detect-evidence.js';

describe('mentionsEvidence', () => {
	it('matches the suggested evidence chip verbatim', () => {
		expect(mentionsEvidence('Hans hat dich um halb zwölf an der Jacke gesehen.')).toBe(true);
	});

	it('matches a free-form mention of the witness', () => {
		expect(mentionsEvidence('Frag doch Hans, der stand an der Garderobe.')).toBe(true);
	});

	it('is case-insensitive', () => {
		expect(mentionsEvidence('BEWEISE VORLEGEN')).toBe(true);
	});

	it('does not match unrelated messages', () => {
		expect(mentionsEvidence('Was soll das denn werden')).toBe(false);
	});
});
