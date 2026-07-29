import { browser } from '$app/environment';
import type { z } from 'zod';
import { playerProfileSchema, type PlayerProfile } from '$lib/content/index.js';
import { getDb } from './db.js';

const SINGLETON_ID = 'singleton';

export class PlayerProfileValidationError extends Error {
	issues: z.ZodIssue[];

	constructor(issues: z.ZodIssue[]) {
		super('Invalid player profile');
		this.name = 'PlayerProfileValidationError';
		this.issues = issues;
	}
}

/**
 * The one store that validates before writing: unlike third-party package content
 * (validated once at import time by $lib/content), a player profile is authored directly
 * via a settings form, so bad shape here should fail loudly rather than write silently.
 */
export const playerProfileStore = {
	async get(): Promise<PlayerProfile | undefined> {
		if (!browser) return undefined;
		const db = await getDb();
		const record = await db.get('playerProfile', SINGLETON_ID);
		if (!record) return undefined;
		return {
			displayName: record.displayName,
			addressAs: record.addressAs,
			pronouns: record.pronouns,
			avatar: record.avatar,
			shortBio: record.shortBio
		};
	},

	async save(profile: PlayerProfile): Promise<PlayerProfile | undefined> {
		const result = playerProfileSchema.safeParse(profile);
		if (!result.success) {
			throw new PlayerProfileValidationError(result.error.issues);
		}
		if (!browser) return undefined;
		const db = await getDb();
		await db.put('playerProfile', {
			...result.data,
			id: SINGLETON_ID,
			updatedAt: new Date().toISOString()
		});
		return result.data;
	}
};
