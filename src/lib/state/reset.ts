/**
 * The two "frisch starten" actions behind `/settings`' reset section.
 *
 * Both end in a full page load rather than trying to rewind the singletons in place: `game`,
 * `storyRuntime` and `profile` each memoize their init promise (deliberately — every screen
 * calls `init()`), so the only honest way to show state that no longer exists is to boot again.
 */

import { browser } from '$app/environment';
import { clearAllStoredData, clearSaves } from '$lib/storage/index.js';
import { setDemoStorySkipped } from '$lib/story/demo-story.js';

/** Everything this app writes to `localStorage` is namespaced with this. */
export const APP_STORAGE_PREFIX = 'riddlon:';

/** ...except the LLM model-cache markers, which describe multi-gigabyte weights that a reset
 *  does not delete (see `llm/model-cache.ts`). */
export const MODEL_MARKER_PREFIX = 'riddlon:llm:';

/**
 * Which `localStorage` keys a factory reset removes. Dropping a model marker would only cost
 * the player a first-run progress bar for a model that is in fact already on the device, so
 * those are kept while every other app key goes.
 */
export function appKeysToClear(keys: readonly string[]): string[] {
	return keys.filter(
		(key) => key.startsWith(APP_STORAGE_PREFIX) && !key.startsWith(MODEL_MARKER_PREFIX)
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
 * Factory reset: installed stories, characters, savegames, profile, settings and package
 * assets. The built-in demo story is *not* re-installed afterwards — that opt-out is the
 * whole point of the action, and `/chat/riddlon` offers the demo back explicitly.
 */
export async function resetEverything(): Promise<void> {
	await clearAllStoredData();
	clearAppLocalStorage();
	// After the wipe, or it would be cleared again as one of the app's own keys.
	setDemoStorySkipped(true);
}
