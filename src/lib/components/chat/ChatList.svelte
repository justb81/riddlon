<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import AppHeader from './AppHeader.svelte';
	import InfoBand from './InfoBand.svelte';
	import Avatar from './Avatar.svelte';
	import ThreadRow from './ThreadRow.svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { game } from '$lib/state/game.svelte.js';
	import { profile } from '$lib/state/profile.svelte.js';
	import { CHARACTERS, SIDE_THREAD_PREVIEWS, STORY_META } from '$lib/story/lucys-portmonnaie.js';
	import { INSTALLED_STORIES } from '$lib/story/library.js';

	/**
	 * The chat overview. On phones this *is* the `/chats` screen; from `lg` up the
	 * same component is the permanently docked sidebar of <AppFrame>, next to
	 * whichever route is open — so it also marks the open thread as active.
	 */

	let searchOpen = $state(false);
	let query = $state('');

	// Which row to mark as the open one in the desktop sidebar. Matched with
	// `endsWith` so a `BASE_PATH`-prefixed deployment (GitHub Pages) still hits.
	const activeId = $derived.by(() => {
		const path = page.url.pathname.replace(/\/$/, '');
		if (path.endsWith('/chat/group')) return 'group';
		if (path.endsWith('/chat/lucy')) return 'lucy';
		if (path.endsWith('/chat/riddlon')) return 'riddlon';
		return '';
	});

	function previewFor(thread: 'lucy' | 'group'): string {
		const messages = game.messagesFor(thread);
		const last = messages.at(-1);
		if (!last) return '';
		if (thread === 'group' && last.from !== 'me' && last.from !== 'system') {
			const name = CHARACTERS[last.from]?.name;
			return name ? `${name}: ${last.text}` : last.text;
		}
		return last.text;
	}

	function timeFor(thread: 'lucy' | 'group', fallback: string): string {
		return game.messagesFor(thread).at(-1)?.time ?? fallback;
	}

	const threads = $derived(
		[
			{
				id: 'group',
				href: resolve('/chat/[thread]', { thread: 'group' }),
				name: 'Samstagnacht',
				kind: 'group' as const,
				count: String(STORY_META.contactCount),
				preview: previewFor('group'),
				time: timeFor('group', '23:08'),
				unread: game.solved ? 0 : 2
			},
			{
				id: 'lucy',
				href: resolve('/chat/[thread]', { thread: 'lucy' }),
				name: 'Lucy',
				kind: 'solo' as const,
				initial: CHARACTERS.lucy.initial,
				preview: previewFor('lucy'),
				time: timeFor('lucy', '21:00'),
				unread: 1
			},
			{
				id: 'sabine',
				href: resolve('/chat/[thread]', { thread: 'lucy' }),
				name: 'Sabine',
				kind: 'solo' as const,
				initial: CHARACTERS.sabine.initial,
				preview: SIDE_THREAD_PREVIEWS.sabine,
				time: '20:44',
				unread: 0
			},
			{
				id: 'max',
				href: resolve('/chat/[thread]', { thread: 'lucy' }),
				name: 'Max',
				kind: 'solo' as const,
				initial: CHARACTERS.max.initial,
				preview: SIDE_THREAD_PREVIEWS.max,
				time: '20:39',
				unread: 0
			},
			{
				id: 'riddlon',
				href: resolve('/chat/riddlon'),
				name: 'Riddlon',
				kind: 'system' as const,
				preview: t('chats.libraryPreview', { count: INSTALLED_STORIES.length }),
				time: 'Di',
				unread: 0
			}
		].filter(
			(thread) =>
				!query.trim() ||
				(thread.name + ' ' + thread.preview).toLowerCase().includes(query.trim().toLowerCase())
		)
	);
</script>

<AppHeader>
	{#snippet leading()}
		<a href={resolve('/settings')} aria-label={t('settings.title')}>
			<Avatar kind="cover" size={34} />
		</a>
	{/snippet}
	{#if !searchOpen}
		<span class="block text-h1 font-medium text-slate-100">{t('chats.title')}</span>
	{:else}
		<input
			bind:value={query}
			placeholder={t('chats.searchPlaceholder')}
			class="w-full min-w-0 rounded-full border border-accent/50 bg-slate-100/5 px-3.5 py-2.5 text-body text-slate-100 placeholder:text-slate-500 focus:border-accent/75 focus:outline-none"
		/>
	{/if}
	{#snippet trailing()}
		<button
			type="button"
			onclick={() => {
				searchOpen = !searchOpen;
				if (!searchOpen) query = '';
			}}
			aria-label={t('chats.searchPlaceholder')}
			class="flex size-8.5 flex-none items-center justify-center rounded-full hover:bg-slate-100/8"
		>
			{#if searchOpen}
				<svg
					width="15"
					height="15"
					viewBox="0 0 15 15"
					fill="none"
					stroke="var(--color-accent)"
					stroke-width="1.7"
					stroke-linecap="round"
				>
					<line x1="2" y1="2" x2="13" y2="13" />
					<line x1="13" y1="2" x2="2" y2="13" />
				</svg>
			{:else}
				<svg
					width="17"
					height="17"
					viewBox="0 0 17 17"
					fill="none"
					stroke="var(--color-slate-400)"
					stroke-width="1.6"
					stroke-linecap="round"
				>
					<circle cx="7" cy="7" r="5.3" />
					<line x1="11" y1="11" x2="15.2" y2="15.2" />
				</svg>
			{/if}
		</button>
	{/snippet}
</AppHeader>

<InfoBand>
	{#if profile.disguise === 'game'}
		<div class="min-w-0 flex-1">
			<div class="font-mono text-[9px] tracking-[0.11em] text-accent">
				{t('chats.chapterInfo', {
					chapter: STORY_META.currentChapter,
					theme: STORY_META.chapterTheme
				})}
			</div>
			<div class="mt-1 truncate text-label text-slate-400">
				{t('chats.chapterGoal', { goal: STORY_META.chapterGoal })}
			</div>
		</div>
	{:else if profile.disguise === 'subtle'}
		<div class="flex flex-1 items-center gap-2.5">
			<div class="h-0.5 flex-1 overflow-hidden rounded-full bg-slate-100/10">
				<div class="h-full bg-accent/85" style="width:{STORY_META.progressPercent}%"></div>
			</div>
			<span class="flex-none font-mono text-[9px] tracking-[0.11em] text-slate-500">
				{t('chats.progressPercent', { percent: STORY_META.progressPercent })}
			</span>
		</div>
	{:else}
		<span class="font-mono text-[9px] tracking-[0.11em] text-slate-600">
			{t('chats.chatCount', { count: 5 })}
		</span>
	{/if}
</InfoBand>

<div class="min-h-0 flex-1 overflow-y-auto py-2">
	{#each threads as thread (thread.id)}
		<ThreadRow
			href={thread.href}
			name={thread.name}
			kind={thread.kind}
			initial={thread.initial}
			count={thread.count}
			preview={thread.preview}
			time={thread.time}
			unread={thread.unread}
			active={thread.id === activeId}
		/>
	{/each}
</div>
