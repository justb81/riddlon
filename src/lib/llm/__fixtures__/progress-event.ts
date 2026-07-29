/**
 * A minimal `ProgressEvent` stand-in for tests.
 *
 * `ProgressEvent` is a DOM API a real browser always has, but Node's test environment doesn't
 * provide it — only production code ever runs where the real thing exists. `EventTarget.dispatchEvent`
 * does require a genuine `Event` instance though, so a plain object won't do; this is the smallest
 * class that satisfies both constraints.
 */
export function createProgressEvent(
	type: string,
	init: { loaded: number; total: number; lengthComputable?: boolean }
): Event {
	class TestProgressEvent extends Event {
		readonly loaded: number;
		readonly total: number;
		readonly lengthComputable: boolean;

		constructor() {
			super(type);
			this.loaded = init.loaded;
			this.total = init.total;
			this.lengthComputable = init.lengthComputable ?? true;
		}
	}
	return new TestProgressEvent();
}
