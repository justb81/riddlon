import { describe, expect, it } from 'vitest';
import { playerProfileSchema } from './playerProfile.js';

describe('playerProfileSchema', () => {
	it('accepts the docs/arc42 §8.2 minimal shape (addressAs)', () => {
		expect(playerProfileSchema.safeParse({ displayName: 'Alex', addressAs: 'they' }).success).toBe(
			true
		);
	});

	it('accepts the docs/arc42 §8.2 extended shape (pronouns)', () => {
		const result = playerProfileSchema.safeParse({
			displayName: 'Alex',
			pronouns: { subject: 'they', object: 'them', possessive: 'their' },
			avatar: 'player-avatar.png',
			shortBio: 'Interessiert an Geschichte, Rätseln und alten Archiven.'
		});
		expect(result.success).toBe(true);
	});

	it('rejects a profile with neither addressAs nor pronouns', () => {
		expect(playerProfileSchema.safeParse({ displayName: 'Alex' }).success).toBe(false);
	});
});
