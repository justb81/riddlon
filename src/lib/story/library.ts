/** Mock local story catalog for the Riddlon system chat — stands in for the real Registry (docs/concept.md §4.3). */

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

export const INSTALLED_STORIES: CatalogEntry[] = [
	{
		id: 'lucys-portmonnaie',
		title: 'Lucys Portmonnaie',
		genre: 'Krimi',
		status: 'running',
		contactCount: 4,
		chapter: { current: 3, total: 5 },
		progressPercent: 62
	},
	{
		id: 'mitternacht-in-rothenburg',
		title: 'Mitternacht in Rothenburg',
		genre: 'Historie',
		status: 'notStarted',
		contactCount: 6
	},
	{
		id: 'der-letzte-zug',
		title: 'Der letzte Zug',
		genre: 'Krimi',
		status: 'solved',
		contactCount: 4,
		achievements: { earned: 5, total: 5 }
	}
];

export const LAST_INSTALLED_NOTE = { title: 'Der letzte Zug', size: '4,2 MB' };
