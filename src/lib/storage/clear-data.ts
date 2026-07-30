/**
 * "Frisch starten" at the storage layer — what `/settings`' reset actions call.
 *
 * Clears the object stores rather than `indexedDB.deleteDatabase()`: `getDb()` memoizes its
 * connection for the lifetime of the page, and IndexedDB blocks a delete while any connection
 * is open — so a delete would hang until reload, exactly when the caller wants to know it's
 * done. Clearing is equivalent here (the schema is recreated on open anyway, never migrated
 * away from) and resolves immediately.
 */

import { browser } from '$app/environment';
import { ASSET_CACHE_NAME } from './blob-store.js';
import { getDb } from './db.js';

/** Story progress only: drops every savegame, leaves installed packages, the character
 *  library and the player profile untouched, so the story restarts from its first scene. */
export async function clearSaves(): Promise<void> {
	if (!browser) return;
	const db = await getDb();
	await db.clear('saves');
}

/**
 * Everything this app stores locally: installed packages, the character library, savegames,
 * the player profile, and every package asset in Cache Storage.
 *
 * Downloaded LLM weights are deliberately *not* touched — they're gigabytes, live in web-llm's
 * own cache, and are not app state (see `llm/model-cache.ts`).
 */
export async function clearAllStoredData(): Promise<void> {
	if (!browser) return;
	const db = await getDb();
	const tx = db.transaction(['packages', 'characters', 'saves', 'playerProfile'], 'readwrite');
	await Promise.all([
		tx.objectStore('packages').clear(),
		tx.objectStore('characters').clear(),
		tx.objectStore('saves').clear(),
		tx.objectStore('playerProfile').clear(),
		tx.done
	]);
	await caches.delete(ASSET_CACHE_NAME);
}
