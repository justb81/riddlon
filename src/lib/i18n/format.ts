/** Pure lookup/interpolation helpers for the i18n store — framework-free so they're Node-testable. */

export type Dictionary = { [key: string]: string | Dictionary };

/** Resolves a dot-path (`"settings.title"`) against a nested dictionary. */
export function resolveKey(dict: Dictionary, key: string): string | undefined {
	let node: string | Dictionary | undefined = dict;
	for (const part of key.split('.')) {
		if (typeof node !== 'object' || node === null) return undefined;
		node = node[part];
	}
	return typeof node === 'string' ? node : undefined;
}

/** Replaces `{name}` placeholders with `vars.name`, left untouched if a var is missing. */
export function interpolate(text: string, vars?: Record<string, string | number>): string {
	if (!vars) return text;
	return text.replace(/\{(\w+)\}/g, (match, name: string) =>
		name in vars ? String(vars[name]) : match
	);
}
