/** App-wide player profile & settings singleton — "gilt für alle Geschichten". */

import type { DisguiseMode, LocalModelId, Pronoun } from './profile.js';

class ProfileStore {
	nickname = $state('Alex');
	bio = $state('Interessiert an Geschichte, Rätseln und alten Archiven.');
	addressAs = $state<Pronoun>('they/them');
	disguise = $state<DisguiseMode>('subtle');
	notify = $state(true);
	model = $state<LocalModelId>('phi-3-mini');
}

export const profile = new ProfileStore();
