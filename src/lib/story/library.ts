/**
 * Display shape for one row of the local story catalog in the Riddlon system chat.
 *
 * Every row is built from the real registry (`storyRuntime.installedPackages`). The three
 * decorative "also installed" stories that used to live here were pure mockup content and made
 * a freshly reset library look populated, so they're gone — docs/concept.md §4.3's registry is
 * the only source now.
 */

export type StoryStatus = 'running' | 'notStarted' | 'solved';

export interface CatalogEntry {
	id: string;
	title: string;
	genre: string;
	status: StoryStatus;
	contactCount: number;
	/** Only set once a story has been started. */
	chapter?: { current: number; total: number };
	/** Only set once a story is solved. */
	achievements?: { earned: number; total: number };
	progressPercent?: number;
}
