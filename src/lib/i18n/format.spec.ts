import { describe, expect, it } from 'vitest';
import { interpolate, resolveKey } from './format.js';

describe('resolveKey', () => {
	it('resolves a nested dot-path', () => {
		expect(resolveKey({ settings: { title: 'Profil & Einstellungen' } }, 'settings.title')).toBe(
			'Profil & Einstellungen'
		);
	});

	it('returns undefined for a missing path', () => {
		expect(resolveKey({ settings: { title: 'x' } }, 'settings.missing')).toBeUndefined();
	});

	it('returns undefined when a path segment is not an object', () => {
		expect(resolveKey({ settings: 'x' }, 'settings.title')).toBeUndefined();
	});
});

describe('interpolate', () => {
	it('substitutes known placeholders', () => {
		expect(interpolate('Kapitel {n} von {total}', { n: 3, total: 5 })).toBe('Kapitel 3 von 5');
	});

	it('leaves unknown placeholders untouched', () => {
		expect(interpolate('Hallo {name}', {})).toBe('Hallo {name}');
	});

	it('passes text through unchanged without vars', () => {
		expect(interpolate('Chats durchsuchen')).toBe('Chats durchsuchen');
	});
});
