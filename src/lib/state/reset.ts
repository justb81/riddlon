/**
 * The two "frisch starten" actions behind `/settings`' reset section.
 *
 * Both end in a full page load rather than trying to rewind the singletons in place:
 * `storySession`, `storyRuntime` and `profile` each memoize their init promise (deliberately —
 * every screen calls `init()`), so the only honest way to show state that no longer exists is to
 * boot again.
 */

import { browser } from '$app/environment';
import { ENDPOINT_STORAGE_KEY } from '$lib/llm/endpoint-config.js';
import { clearAllStoredData, clearSaves } from '$lib/storage/index.js';

/** Everything this app writes to `localStorage` is namespaced with this. */
export const APP_STORAGE_PREFIX = 'riddlon:';

/** ...except the LLM model-cache markers, which describe multi-gigabyte weights that a reset
 *  does not delete (see `llm/model-cache.ts`). */
export const MODEL_MARKER_PREFIX = 'riddlon:llm:';

/**
 * Which `localStorage` keys a factory reset removes. Dropping a model marker would only cost
 * the player a first-run progress bar for a model that is in fact already on the device, so
 * those are kept while every other app key goes — including the active-package pointer, which
 * would otherwise point at a package the wipe just deleted. The inference-endpoint record is the
 * one exception carved back out of that `riddlon:llm:*` marker prefix: it is configuration, and
 * can carry an API key, so "alles zurücksetzen" clears it same as any other app key.
 */
export function appKeysToClear(keys: readonly string[]): string[] {
	return keys.filter(
		(key) =>
			key.startsWith(APP_STORAGE_PREFIX) &&
			(!key.startsWith(MODEL_MARKER_PREFIX) || key === ENDPOINT_STORAGE_KEY)
	);
}

function clearAppLocalStorage(): void {
	if (!browser) return;
	try {
		for (const key of appKeysToClear(Object.keys(localStorage))) localStorage.removeItem(key);
	} catch {
		// Storage unavailable (private mode, full quota) — the IndexedDB wipe already happened,
		// and a stale settings blob is cosmetic next to it.
	}
}

/** Restarts the story: savegames go, installed content and the player profile stay. */
export async function resetStoryProgress(): Promise<void> {
	await clearSaves();
}

/**
 * Factory reset: installed stories, characters, savegames, profile, settings and package assets.
 * Nothing is re-seeded afterwards — content only ever enters the app through an explicit import
 * (docs/arc42 §6.2), and `/chat/riddlon` offers the bundled example back.
 */
export async function resetEverything(): Promise<void> {
	await clearAllStoredData();
	clearAppLocalStorage();
}
