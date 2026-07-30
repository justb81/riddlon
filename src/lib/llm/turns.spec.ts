import { describe, expect, it } from 'vitest';
import {
	DEFAULT_MAX_HISTORY_TURNS,
	appendTurn,
	buildTurnPrompt,
	toInitialPrompts,
	windowTurns
} from './turns.js';
import type { LlmTurn } from './types.js';

function conversation(pairs: number): LlmTurn[] {
	const turns: LlmTurn[] = [];
	for (let i = 0; i < pairs; i += 1) {
		turns.push({ role: 'user', content: `frage ${i}` });
		turns.push({ role: 'assistant', content: `antwort ${i}` });
	}
	return turns;
}

describe('windowTurns', () => {
	it('keeps a short conversation whole', () => {
		const turns = conversation(2);
		expect(windowTurns(turns, 10)).toBe(turns);
	});

	it('keeps the most recent turns', () => {
		const windowed = windowTurns(conversation(10), 4);
		expect(windowed.map((turn) => turn.content)).toEqual([
			'frage 8',
			'antwort 8',
			'frage 9',
			'antwort 9'
		]);
	});

	it('never starts a window on an orphaned assistant reply', () => {
		// Slicing to 3 would begin at "antwort 8" — a reply whose question was just dropped, which
		// reads to the model as if the character answered nothing.
		const windowed = windowTurns(conversation(10), 3);
		expect(windowed[0].role).toBe('user');
		expect(windowed.map((turn) => turn.content)).toEqual(['frage 9', 'antwort 9']);
	});

	it('returns nothing for a non-positive window', () => {
		expect(windowTurns(conversation(3), 0)).toEqual([]);
	});

	it('has a sane default window', () => {
		expect(DEFAULT_MAX_HISTORY_TURNS).toBeGreaterThan(1);
	});
});

describe('toInitialPrompts', () => {
	it('puts the system prompt first, then history', () => {
		expect(toInitialPrompts('Du bist Lucy.', conversation(1))).toEqual([
			{ role: 'system', content: 'Du bist Lucy.' },
			{ role: 'user', content: 'frage 0' },
			{ role: 'assistant', content: 'antwort 0' }
		]);
	});

	it('omits an empty system prompt rather than sending a blank one', () => {
		expect(toInitialPrompts('   ')).toEqual([]);
	});
});

describe('buildTurnPrompt', () => {
	it('renders persona, history and the new message into one prompt', () => {
		const prompt = buildTurnPrompt('Du bist Lucy.', conversation(1), 'Wo warst du?');
		expect(prompt).toBe(
			[
				'Du bist Lucy.',
				'User: frage 0',
				'Assistant: antwort 0',
				'User: Wo warst du?',
				'Assistant:'
			].join('\n\n')
		);
	});

	it('works without persona or history', () => {
		expect(buildTurnPrompt('', [], 'Hallo')).toBe('User: Hallo\n\nAssistant:');
	});
});

describe('appendTurn', () => {
	it('appends without mutating the original', () => {
		const turns = conversation(1);
		const next = appendTurn(turns, 'user', 'noch was');
		expect(turns).toHaveLength(2);
		expect(next).toHaveLength(3);
		expect(next[2]).toEqual({ role: 'user', content: 'noch was' });
	});
});
