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
	it('puts the messenger-format rule first, ahead of identity and role (#79)', () => {
		// A 1B model's instruction-following degrades with distance from the start of the system
		// prompt — the format/behavior rules must lead, not trail identity/traits/role.
		const prompt = buildPersonaPrompt(base);
		const firstLine = prompt.split('\n')[0];
		expect(firstLine).toBe(
			'Schreib wie in einem Messenger: kurz, 1-2 Sätze, auf Deutsch, in der Ich-Form.'
		);
		expect(prompt.indexOf('Schreib wie in einem Messenger')).toBeLessThan(
			prompt.indexOf('Du bist Lucy')
		);
	});

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
		// docs/arc42 §8.1.5: a secret stays back until its revealCondition holds, so the two
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

	it('names the people the cast binding says this character knows', () => {
		// A solo scene has no `otherParticipants`, so without this a character cannot name anyone
		// who isn't in the room — and a goal like "name-max-and-sabine-as-witnesses" is unreachable.
		const prompt = buildPersonaPrompt({
			...base,
			scene: { goals: ['name-max-and-sabine-as-witnesses'], isGroup: false, otherParticipants: [] },
			relationships: [
				{ displayName: 'Max', relation: 'friend' },
				{ displayName: 'Sabine', relation: 'friend' }
			]
		});
		expect(prompt).toContain('Max (friend)');
		expect(prompt).toContain('Sabine (friend)');
	});

	it('omits the relationships section for a character with none', () => {
		expect(buildPersonaPrompt({ ...base, relationships: [] })).not.toContain('Diese Leute kennst');
	});
});

describe('buildOpeningInstruction', () => {
	it('addresses the player by name', () => {
		expect(buildOpeningInstruction('Bastian')).toContain('Bastian');
	});

	it('points the opener at the scene’s first goal and forbids small talk', () => {
		// Without the goal in the turn instruction the model opens with filler ("bist du noch
		// online?") — safest completion, but it doesn't open the scene.
		const instruction = buildOpeningInstruction('Bastian', [
			'ask-whether-player-was-at-the-club',
			'reveal-identity-as-lucy'
		]);
		expect(instruction).toContain('ask-whether-player-was-at-the-club');
		expect(instruction).not.toContain('reveal-identity-as-lucy');
		expect(instruction).toContain('Smalltalk');
	});

	it('still works for a scene that declares no goals', () => {
		expect(buildOpeningInstruction('Bastian', [])).not.toContain('erstes Ziel');
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
