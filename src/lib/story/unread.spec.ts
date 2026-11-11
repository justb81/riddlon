import { describe, expect, it } from 'vitest';
import { countUnread } from './unread.js';
import type { ChatMessage } from './types.js';

const msg = (from: string, sentAt?: string): ChatMessage => ({ id: 'x', from, text: 't', sentAt });

describe('countUnread', () => {
	it('counts everything from others when never read', () => {
		expect(countUnread([msg('lucy', '2026-01-01T10:00:00Z'), msg('lucy')])).toBe(2);
	});
	it('ignores own and system messages', () => {
		expect(
			countUnread([msg('me', '2026-01-01T10:00:00Z'), msg('system', '2026-01-01T10:00:00Z')])
		).toBe(0);
	});
	it('counts only messages newer than the marker', () => {
		const read = '2026-01-01T10:00:00Z';
		expect(
			countUnread(
				[
					msg('lucy', '2026-01-01T09:00:00Z'),
					msg('lucy', read),
					msg('lucy', '2026-01-01T10:00:01Z')
				],
				read
			)
		).toBe(1);
	});
	it('treats a missing sentAt as read once anything has been read', () => {
		expect(countUnread([msg('lucy')], '2026-01-01T10:00:00Z')).toBe(0);
	});
});
