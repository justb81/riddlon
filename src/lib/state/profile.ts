/** Pure profile helpers — kept framework-free so they're Node-testable (see profile.spec.ts). */

export type DisguiseMode = 'pure' | 'subtle' | 'game';
export type Pronoun = 'sie/ihr' | 'er/ihm' | 'they/them' | 'nur Vorname';

/**
 * The model domain lives in `$lib/llm` (docs/concept.md §3.2 puts "Modellauswahl" there), and the
 * available models plus their real sizes come from its catalog. Re-exported here because the profile
 * is what *stores* the player's choice — see `profile.svelte.ts`.
 */
export type { LocalModelId } from '$lib/llm/catalog.js';

export const PRONOUN_OPTIONS: Pronoun[] = ['sie/ihr', 'er/ihm', 'they/them', 'nur Vorname'];

export const DISGUISE_MODES: DisguiseMode[] = ['pure', 'subtle', 'game'];

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
