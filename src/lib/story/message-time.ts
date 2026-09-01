/**
 * The timestamp under a chat bubble.
 *
 * A bare `HH:MM` is right for a conversation happening now, and wrong the moment a thread carries
 * authored history (docs/arc42 §8.1.8): a seed message offset by a whole number of days lands on
 * the same wall-clock minute as the present, so three lines from last Tuesday all read "13:30" and
 * the history looks like it was written seconds ago — which is exactly the seam seed chats exist to
 * hide.
 *
 * Pure and framework-free (Node test project); the caller passes the localized "yesterday" word so
 * this module stays free of the i18n store.
 */

function pad(value: number): string {
	return String(value).padStart(2, '0');
}

function startOfDay(date: Date): number {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export interface MessageTimestampOptions {
	/** Epoch ms to compare against; defaults to the real clock. */
	now?: number;
	/** Localized word for the previous calendar day, e.g. "Gestern". */
	yesterdayLabel: string;
}

/**
 * `HH:MM` today, `<yesterday>, HH:MM` on the previous day, `DD.MM., HH:MM` before that. Returns an
 * empty string for an unparseable timestamp rather than "NaN:NaN".
 */
export function formatMessageTimestamp(
	sentAt: string,
	{ now = Date.now(), yesterdayLabel }: MessageTimestampOptions
): string {
	const sent = new Date(sentAt);
	const sentMs = sent.getTime();
	if (Number.isNaN(sentMs)) return '';

	const clock = `${pad(sent.getHours())}:${pad(sent.getMinutes())}`;
	// Calendar days, not elapsed hours: 23:50 yesterday is "yesterday" at 00:10, not "12 hours ago".
	const dayDelta = Math.round(
		(startOfDay(new Date(now)) - startOfDay(sent)) / (24 * 60 * 60 * 1000)
	);
	if (dayDelta <= 0) return clock;
	if (dayDelta === 1) return `${yesterdayLabel}, ${clock}`;
	return `${pad(sent.getDate())}.${pad(sent.getMonth() + 1)}., ${clock}`;
}
