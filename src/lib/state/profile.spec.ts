import { describe, expect, it } from 'vitest';
import { addressPreview } from './profile.js';

describe('addressPreview', () => {
	it('previews the nickname directly for "nur Vorname"', () => {
		expect(addressPreview('nur Vorname', 'Alex')).toEqual({
			key: 'settings.previewFirstName',
			vars: { nickname: 'Alex' }
		});
	});

	it('falls back to "Du" when the nickname is blank', () => {
		expect(addressPreview('nur Vorname', '  ')).toEqual({
			key: 'settings.previewFirstName',
			vars: { nickname: 'Du' }
		});
	});

	it('maps sie/ihr to the formal object form', () => {
		expect(addressPreview('sie/ihr', 'Alex')).toEqual({
			key: 'settings.previewPronoun',
			vars: { form: 'Sie' }
		});
	});

	it('maps er/ihm to "ihn"', () => {
		expect(addressPreview('er/ihm', 'Alex').vars.form).toBe('ihn');
	});

	it('maps they/them to "dich"', () => {
		expect(addressPreview('they/them', 'Alex').vars.form).toBe('dich');
	});
});
