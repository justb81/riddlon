/**
 * Which installed story package is the active one, and how a cold start picks it.
 *
 * Split out of `engine.svelte.ts` because both halves are worth testing in Node: the ordering
 * is pure, and the persistence is three lines of guarded `localStorage` (same shape as the
 * other `riddlon:`-prefixed markers).
 *
 * The activation *pointer* has to be persisted at all because `StoryRuntime` used to hold it
 * purely in memory: whichever package a screen had switched to was forgotten on the next
 * reload, so the app came back claiming nothing was installed while the library still listed
 * the story.
 */

import { browser } from '$app/environment';

const KEY = 'riddlon:active-package';

export function readActivePackageId(): string | null {
	if (!browser) return null;
	try {
		return localStorage.getItem(KEY);
	} catch {
		// Storage unavailable (private mode, quota) — the boot falls back to "most recently
		// installed", which is a worse guess but never a broken one.
		return null;
	}
}

export function writeActivePackageId(id: string | null): void {
	if (!browser) return;
	try {
		if (id === null) localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, id);
	} catch {
		// Same fallback as above: the choice is lost on the next boot, nothing breaks.
	}
}

/**
 * The order in which a boot should *try* to activate installed packages. Callers walk the list
 * and take the first one that actually yields a loadable bundle — a package whose record
 * predates a schema addition can fail to load, and that must not leave the runtime with no
 * active session at all.
 *
 * Preference: what the player last had open, then most recently installed first (a fresh
 * import is what they were just doing).
 */
export function activationCandidateIds(
	preferredId: string | null,
	packages: readonly { id: string; installedAt: string }[]
): string[] {
	const byRecency = [...packages]
		.sort((a, b) => b.installedAt.localeCompare(a.installedAt))
		.map((pkg) => pkg.id);
	const preferred = preferredId !== null && byRecency.includes(preferredId) ? [preferredId] : [];
	return [...preferred, ...byRecency.filter((id) => id !== preferredId)];
}
