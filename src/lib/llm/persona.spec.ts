import { describe, expect, it } from 'vitest';
import { buildOpeningInstruction, buildPersonaPrompt, pickResponder } from './persona.js';

const base = {
	character: {
		id: 'c1',
		displayName: 'Lucy',
		voiceStyle: 'informell, jung',
		corePersonality: 'impulsiv, loyal',
		roleInStory: 'quest-giver'
	},
	storyTitle: 'Lucys Portmonnaie',
	scene: {
		goals: ['reveal-identity-as-lucy'],
		isGroup: false,
		otherParticipants: []
	},
	knowledge: {
		facts: ['Lucy wurde im Club ihr Portmonnaie gestohlen.'],
		revealableSecrets: [],
		withheldSecrets: ['Hans belastet Max']
	},
	playerName: 'Bastian'
};

describe('buildPersonaPrompt', () => {
	it('carries identity, role, goals and the canon rule', () => {
		const prompt = buildPersonaPrompt(base);
		expect(prompt).toContain('Du bist Lucy');
		expect(prompt).toContain('impulsiv, loyal; informell, jung');
		expect(prompt).toContain('quest-giver');
		expect(prompt).toContain('reveal-identity-as-lucy');
		expect(prompt).toContain('Lucy wurde im Club ihr Portmonnaie gestohlen.');
	});

	it('keeps withheld secrets separate from revealable ones', () => {
		const prompt = buildPersonaPrompt(base);
		// docs/concept.md §5.5: a secret stays back until its revealCondition holds, so the two
		// lists must never be merged into one "here is what you know".
		expect(prompt).toContain('behältst es aber noch für dich');
		expect(prompt).not.toContain('Das darfst du jetzt preisgeben');
	});

	it('omits sections a character has nothing for', () => {
		const prompt = buildPersonaPrompt({
			...base,
			knowledge: { facts: [], revealableSecrets: [], withheldSecrets: [] }
		});
		expect(prompt).not.toContain('Das ist wahr');
		expect(prompt).not.toContain('behältst es aber noch für dich');
	});

	it('names the other participants in a group scene', () => {
		const prompt = buildPersonaPrompt({
			...base,
			scene: {
				goals: [],
				isGroup: true,
				otherParticipants: ['Max', 'Sabine'],
				playerRole: 'confront-max-with-evidence'
			}
		});
		expect(prompt).toContain('Gruppenchat mit: Max, Sabine');
		expect(prompt).toContain('confront-max-with-evidence');
	});
});

describe('buildOpeningInstruction', () => {
	it('addresses the player by name', () => {
		expect(buildOpeningInstruction('Bastian')).toContain('Bastian');
	});
});

describe('pickResponder', () => {
	const cast = [
		{ id: 'lucy', displayName: 'Lucy' },
		{ id: 'max', displayName: 'Max' }
	];

	it('answers as the character the player addressed', () => {
		expect(pickResponder(cast, 'Max, sag die Wahrheit.')).toBe('max');
	});

	it('matches a mention case-insensitively', () => {
		expect(pickResponder(cast, 'was sagt eigentlich max dazu?')).toBe('max');
	});

	it('falls back to the first participant when nobody is named', () => {
		expect(pickResponder(cast, 'Und jetzt?')).toBe('lucy');
	});

	it('has nobody to pick in an empty group', () => {
		expect(pickResponder([], 'Hallo?')).toBeNull();
	});
});
