import { browser } from '$app/environment';
import type { CharacterIdentity } from '$lib/content/index.js';
import { getDb, type LibraryCharacterRecord } from './db.js';

export type { LibraryCharacterRecord };

/**
 * Pure dedup decision, IDB-free and directly unit-testable. If the character isn't known
 * yet, create it. If it is, keep the first-installed identity fields untouched and only
 * link the new package — never overwrite an existing identity with a later package's copy.
 * (Version-conflict handling when two packages disagree on identity fields for the same
 * UUID is an explicit open point in docs/concept.md §9; "first write wins, link don't
 * overwrite" is this module's minimal, documented resolution, not a full conflict strategy.)
 */
export function mergeCharacterLink(
	existing: LibraryCharacterRecord | undefined,
	incoming: CharacterIdentity,
	packageId: string
): LibraryCharacterRecord {
	if (!existing) {
		return { ...incoming, linkedPackageIds: [packageId] };
	}
	if (existing.linkedPackageIds.includes(packageId)) {
		return existing;
	}
	return { ...existing, linkedPackageIds: [...existing.linkedPackageIds, packageId] };
}

export const characterLibrary = {
	async upsertFromPackage(
		character: CharacterIdentity,
		packageId: string
	): Promise<LibraryCharacterRecord | undefined> {
		if (!browser) return undefined;
		const db = await getDb();
		const existing = await db.get('characters', character.id);
		const merged = mergeCharacterLink(existing, character, packageId);
		await db.put('characters', merged);
		return merged;
	},

	async unlinkPackage(characterId: string, packageId: string): Promise<void> {
		if (!browser) return;
		const db = await getDb();
		const existing = await db.get('characters', characterId);
		if (!existing) return;
		const linkedPackageIds = existing.linkedPackageIds.filter((id) => id !== packageId);
		if (linkedPackageIds.length === 0) {
			await db.delete('characters', characterId);
		} else {
			await db.put('characters', { ...existing, linkedPackageIds });
		}
	},

	async getById(characterId: string): Promise<LibraryCharacterRecord | undefined> {
		if (!browser) return undefined;
		const db = await getDb();
		return db.get('characters', characterId);
	},

	async list(): Promise<LibraryCharacterRecord[]> {
		if (!browser) return [];
		const db = await getDb();
		return db.getAll('characters');
	}
};
