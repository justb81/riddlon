/**
 * Minimal i18n store. Riddlon ships German-only for now (see docs/concept.md §"Vision"),
 * but every UI-chrome string is looked up through here so a second `<locale>.json` plus
 * one line in `dictionaries` is the entire cost of adding a language later.
 *
 * Story content (character dialogue, clue text, achievement titles) is deliberately NOT
 * routed through this dictionary — it lives in `$lib/story/*` as mock installed-package
 * data, mirroring how a real story package would ship its own localized content.
 */

import de from './de.json' with { type: 'json' };
import { interpolate, resolveKey, type Dictionary } from './format.js';

export type Locale = 'de';

const dictionaries: Record<Locale, Dictionary> = { de };

class I18nStore {
	locale = $state<Locale>('de');

	t(key: string, vars?: Record<string, string | number>): string {
		const text = resolveKey(dictionaries[this.locale], key);
		if (text === undefined) {
			console.warn(`[i18n] missing key "${key}" for locale "${this.locale}"`);
			return key;
		}
		return interpolate(text, vars);
	}
}

export const i18n = new I18nStore();

/** Shorthand for `i18n.t(...)`, importable directly into `.svelte` templates. */
export function t(key: string, vars?: Record<string, string | number>): string {
	return i18n.t(key, vars);
}
