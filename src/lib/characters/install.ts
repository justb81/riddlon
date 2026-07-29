import type { CharacterIdentity } from '$lib/content/index.js';
import { characterLibrary, type LibraryCharacterRecord } from '$lib/storage/index.js';

/**
 * Thin orchestration entrypoint — the dedup guarantee itself lives in
 * $lib/storage/character-library.ts (mergeCharacterLink), owned there so this module can
 * depend on storage without storage needing to depend back on characters.
 */
export async function installPackageCharacters(
	packageId: string,
	characters: CharacterIdentity[]
): Promise<LibraryCharacterRecord[]> {
	const records = await Promise.all(
		characters.map((character) => characterLibrary.upsertFromPackage(character, packageId))
	);
	return records.filter((record): record is LibraryCharacterRecord => record !== undefined);
}
