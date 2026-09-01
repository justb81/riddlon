import { describe, expect, it } from 'vitest';
import { formatMessageTimestamp } from './message-time.js';

/** Local time on purpose: the timestamps are read by a person in their own timezone. */
function local(year: number, month: number, day: number, hour: number, minute: number): Date {
	return new Date(year, month - 1, day, hour, minute);
}

const NOW = local(2026, 3, 1, 13, 30).getTime();
const yesterdayLabel = 'Gestern';

describe('formatMessageTimestamp', () => {
	it('shows only the clock for a message from today', () => {
		expect(formatMessageTimestamp(local(2026, 3, 1, 9, 5).toISOString(), { now: NOW, yesterdayLabel }))
			.toBe('09:05');
	});

	it('names yesterday, so a seed message a whole day old is not mistaken for a new one', () => {
		// The case that made this necessary: an offset of exactly "P1D" lands on the same minute.
		expect(
			formatMessageTimestamp(local(2026, 2, 28, 13, 30).toISOString(), { now: NOW, yesterdayLabel })
		).toBe('Gestern, 13:30');
	});

	it('falls back to the date for anything older', () => {
		expect(
			formatMessageTimestamp(local(2026, 2, 24, 13, 30).toISOString(), { now: NOW, yesterdayLabel })
		).toBe('24.02., 13:30');
	});

	it('counts calendar days, not elapsed hours', () => {
		// 20 minutes apart, but on either side of midnight.
		const justAfterMidnight = local(2026, 3, 1, 0, 10).getTime();
		expect(
			formatMessageTimestamp(local(2026, 2, 28, 23, 50).toISOString(), {
				now: justAfterMidnight,
				yesterdayLabel
			})
		).toBe('Gestern, 23:50');
	});

	it('returns an empty string for an unparseable timestamp instead of "NaN:NaN"', () => {
		expect(formatMessageTimestamp('not a date', { now: NOW, yesterdayLabel })).toBe('');
	});
});
