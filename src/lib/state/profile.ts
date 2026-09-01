/** Pure profile helpers — kept framework-free so they're Node-testable (see profile.spec.ts). */

export type DisguiseMode = 'pure' | 'subtle' | 'game';
/**
 * A free-form string, not a closed union: docs/arc42 §8.2 explicitly rejects a rigid
 * pronoun selection ("starre Auswahl"). `PRONOUN_OPTIONS` below are quick-select presets,
 * not the full set of valid values — the settings screen also offers free-text entry.
 */
export type Pronoun = string;

export const PRONOUN_OPTIONS: Pronoun[] = ['sie/ihr', 'er/ihm', 'they/them', 'nur Vorname'];

export const DISGUISE_MODES: DisguiseMode[] = ['pure', 'subtle', 'game'];

/**
 * Picks the i18n key + vars for the "how Lucy addresses you" preview line.
 * "nur Vorname" previews the nickname directly; the three preset pronouns map to the
 * grammatical object form used in the same sentence template; anything else (free-text
 * entry) is used verbatim as that object form.
 */
export function addressPreview(
	pronoun: Pronoun,
	nickname: string
): { key: string; vars: Record<string, string> } {
	if (pronoun === 'nur Vorname') {
		return { key: 'settings.previewFirstName', vars: { nickname: nickname.trim() || 'Du' } };
	}
	const presetForm =
		pronoun === 'sie/ihr'
			? 'Sie'
			: pronoun === 'er/ihm'
				? 'ihn'
				: pronoun === 'they/them'
					? 'dich'
					: undefined;
	const form = presetForm ?? (pronoun.trim() || 'dich');
	return { key: 'settings.previewPronoun', vars: { form } };
}
