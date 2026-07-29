/** App-wide player profile & settings singleton — "gilt für alle Geschichten". */

import { DEFAULT_MODEL_ID, type LocalModelId } from '$lib/llm/catalog.js';
import type { DisguiseMode, Pronoun } from './profile.js';

class ProfileStore {
	nickname = $state('Alex');
	bio = $state('Interessiert an Geschichte, Rätseln und alten Archiven.');
	addressAs = $state<Pronoun>('they/them');
	disguise = $state<DisguiseMode>('subtle');
	notify = $state(true);
	/**
	 * The model the player *chose*. What's actually loaded is `llm.activeModelId` — the two differ
	 * whenever a selected model hasn't been downloaded yet.
	 */
	model = $state<LocalModelId>(DEFAULT_MODEL_ID);
}

export const profile = new ProfileStore();
