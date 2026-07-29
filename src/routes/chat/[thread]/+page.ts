import { error } from '@sveltejs/kit';
import type { ThreadId } from '$lib/state/game.svelte.js';
import type { EntryGenerator, PageLoad } from './$types.js';

const THREAD_IDS: ThreadId[] = ['lucy', 'group'];

export const entries: EntryGenerator = () => THREAD_IDS.map((thread) => ({ thread }));

export const load: PageLoad = ({ params }) => {
	const thread = params.thread as ThreadId;
	if (!THREAD_IDS.includes(thread)) {
		error(404, 'Unbekannter Chat');
	}
	return { thread };
};
