/**
 * Converts an ISO-8601 duration (`content/schemas/common.ts`'s `isoDurationSchema`, e.g.
 * `"PT2H"`) into milliseconds, for `delayedEvents[].approxDelay` (docs/concept.md §5.6).
 * Year/month are calendar-ambiguous by nature, so they're resolved with the same
 * "approximate, not exact" tolerance §5.6 already grants the whole delayed-event mechanism
 * (365-day years, 30-day months) — nothing in this codebase needs sub-day precision there.
 */
const DURATION_RE = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_MONTH_APPROX = 30 * MS_PER_DAY;
const MS_PER_YEAR_APPROX = 365 * MS_PER_DAY;

/** Returns `undefined` for a malformed or all-zero duration rather than throwing. */
export function parseIsoDurationMs(duration: string): number | undefined {
	const match = DURATION_RE.exec(duration);
	if (!match) return undefined;
	const [, years, months, days, hours, minutes, seconds] = match;
	if (!years && !months && !days && !hours && !minutes && !seconds) return undefined;

	return (
		Number(years ?? 0) * MS_PER_YEAR_APPROX +
		Number(months ?? 0) * MS_PER_MONTH_APPROX +
		Number(days ?? 0) * MS_PER_DAY +
		Number(hours ?? 0) * MS_PER_HOUR +
		Number(minutes ?? 0) * MS_PER_MINUTE +
		Number(seconds ?? 0) * MS_PER_SECOND
	);
}
