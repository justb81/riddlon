/** Pure profile helpers — kept framework-free so they're Node-testable (see profile.spec.ts). */

export type DisguiseMode = 'pure' | 'subtle' | 'game';
export type Pronoun = 'sie/ihr' | 'er/ihm' | 'they/them' | 'nur Vorname';
export type LocalModelId = 'phi-3-mini' | 'llama-3-8b';

export const PRONOUN_OPTIONS: Pronoun[] = ['sie/ihr', 'er/ihm', 'they/them', 'nur Vorname'];

export const DISGUISE_MODES: DisguiseMode[] = ['pure', 'subtle', 'game'];

export interface LocalModelOption {
	id: LocalModelId;
	label: string;
	sizeLabel: string;
	loaded: boolean;
}

export const MODEL_OPTIONS: LocalModelOption[] = [
	{ id: 'phi-3-mini', label: 'Phi-3 Mini', sizeLabel: '1,8 GB', loaded: true },
	{ id: 'llama-3-8b', label: 'Llama 3 8B', sizeLabel: '4,6 GB', loaded: false }
];

/**
 * Picks the i18n key + vars for the "how Lucy addresses you" preview line.
 * "nur Vorname" previews the nickname directly; every pronoun option maps to
 * the grammatical object form used in the same sentence template.
 */
export function addressPreview(
	pronoun: Pronoun,
	nickname: string
): { key: string; vars: Record<string, string> } {
	if (pronoun === 'nur Vorname') {
		return { key: 'settings.previewFirstName', vars: { nickname: nickname.trim() || 'Du' } };
	}
	const form = pronoun === 'sie/ihr' ? 'Sie' : pronoun === 'er/ihm' ? 'ihn' : 'dich';
	return { key: 'settings.previewPronoun', vars: { form } };
}
