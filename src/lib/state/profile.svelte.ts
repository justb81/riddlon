/** App-wide player profile & settings singleton — "gilt für alle Geschichten". */

import { browser } from '$app/environment';
import { playerProfileStore } from '$lib/storage/index.js';
import type { DisguiseMode, Pronoun } from './profile.js';

const APP_SETTINGS_KEY = 'riddlon:app-settings';

/** Disguise level and the notify toggle are app-level settings, not part of the story-package
 *  `PlayerProfile` schema — kept in `localStorage` (like `onboarding.ts`), separate from the
 *  IndexedDB-backed `playerProfileStore` that owns nickname/bio/pronouns.
 *
 *  There is deliberately no model choice here: which local model runs is entirely the app's
 *  decision (native Prompt API first, else the best WebLLM model this device can hold — see
 *  `$lib/llm/capabilities.ts`'s `bestSupportedModelId`), not something the player picks. */
interface StoredAppSettings {
	disguise: DisguiseMode;
	notify: boolean;
}

function loadAppSettings(): Partial<StoredAppSettings> {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(APP_SETTINGS_KEY);
		return raw ? (JSON.parse(raw) as Partial<StoredAppSettings>) : {};
	} catch {
		return {};
	}
}

function saveAppSettings(settings: StoredAppSettings): void {
	if (!browser) return;
	try {
		localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
	} catch {
		// Storage can be unavailable (private mode, full quota) — settings just don't persist.
	}
}

class ProfileStore {
	nickname = $state('Alex');
	bio = $state('Interessiert an Geschichte, Rätseln und alten Archiven.');
	addressAs = $state<Pronoun>('they/them');
	disguise = $state<DisguiseMode>('subtle');
	notify = $state(true);

	#loaded = false;

	constructor() {
		if (browser) void this.#load();
	}

	async #load(): Promise<void> {
		const stored = loadAppSettings();
		if (stored.disguise) this.disguise = stored.disguise;
		if (stored.notify !== undefined) this.notify = stored.notify;

		const saved = await playerProfileStore.get();
		if (saved) {
			if (saved.displayName) this.nickname = saved.displayName;
			if (saved.shortBio !== undefined) this.bio = saved.shortBio;
			if (saved.addressAs) this.addressAs = saved.addressAs;
		}

		// Only after the stored values (if any) have been applied — otherwise the very first
		// `persist()` a settings-screen effect fires would overwrite them with in-memory defaults.
		this.#loaded = true;
	}

	/** Called by the settings screen whenever a field changes. Cheap enough (a handful of
	 *  fields, no per-keystroke fan-out risk) to call on every change rather than debounce. */
	persist(): void {
		if (!browser || !this.#loaded) return;
		saveAppSettings({ disguise: this.disguise, notify: this.notify });
		playerProfileStore
			.save({
				displayName: this.nickname.trim() || undefined,
				shortBio: this.bio.trim() || undefined,
				// `playerProfileSchema` requires a non-empty `addressAs` (or `pronouns`) — an
				// emptied free-text field falls back rather than failing validation silently.
				addressAs: this.addressAs.trim() || 'they/them'
			})
			.catch(() => {
				// Storage can be unavailable (private mode, full quota) — same as `onboarding.ts`.
			});
	}
}

export const profile = new ProfileStore();
