/**
 * Whether the built-in demo story ("Lucys Portmonnaie", `reference-package.ts`) may be
 * auto-installed on this device.
 *
 * Without this flag `ensureReferenceStoryInstalled()` re-seeds the demo on the very next boot,
 * so "alles zurücksetzen" in `/settings` would hand the player back the same demo content they
 * just deleted. A factory reset therefore turns auto-install off; the (then empty) library in
 * `/chat/riddlon` offers the demo back as an explicit choice.
 */

import { browser } from '$app/environment';

const KEY = 'riddlon:skip-demo-story';

export function isDemoStorySkipped(): boolean {
	if (!browser) return false;
	try {
		return localStorage.getItem(KEY) === '1';
	} catch {
		// Storage unavailable (private mode, full quota) — auto-installing the demo is the
		// friendlier failure for a brand-new device, so treat "unknown" as "not skipped".
		return false;
	}
}

export function setDemoStorySkipped(skipped: boolean): void {
	if (!browser) return;
	try {
		if (skipped) localStorage.setItem(KEY, '1');
		else localStorage.removeItem(KEY);
	} catch {
		// Same fallback as above: the demo may reappear on the next boot, nothing breaks.
	}
}
