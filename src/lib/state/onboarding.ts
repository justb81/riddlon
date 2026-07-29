/** Tracks whether the splash screen has ever completed a first-run install on this device. */

import { browser } from '$app/environment';

const KEY = 'riddlon:onboarded';

export function hasOnboarded(): boolean {
	if (!browser) return false;
	try {
		return localStorage.getItem(KEY) === '1';
	} catch {
		return false;
	}
}

export function markOnboarded(): void {
	if (!browser) return;
	try {
		localStorage.setItem(KEY, '1');
	} catch {
		// Storage can be unavailable (private mode, full quota) — re-running the first-run
		// boot next time is a safe fallback, just a slightly longer splash.
	}
}
