<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import AppHeader from './AppHeader.svelte';
	import InfoBand from './InfoBand.svelte';
	import Avatar from './Avatar.svelte';
	import ThreadRow from './ThreadRow.svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { storyRuntime } from '$lib/state/engine.svelte.js';
	import { storySession } from '$lib/state/story-session.svelte.js';
	import { profile } from '$lib/state/profile.svelte.js';

	/**
	 * The chat overview. On phones this *is* the `/chats` screen; from `lg` up the same component
	 * is the permanently docked sidebar of <AppFrame>, next to whichever route is open — so it
	 * also marks the open thread as active.
	 *
	 * Every story row comes from the active package's engine state. There are no invented
	 * contacts and no invented previews: a character appears once the story makes them visible,
	 * and a group chat once its scene unlocks.
	 */

	let searchOpen = $state(false);
	let query = $state('');

	// Which row is open in the desktop sidebar. `/chat?thread=<key>` for story threads, plus the
	// system chat's own path.
	const activeId = $derived.by(() => {
		const path = page.url.pathname.replace(/\/$/, '');
		if (path.endsWith('/chat/riddlon')) return 'riddlon';
		if (path.endsWith('/chat')) return page.url.searchParams.get('thread') ?? '';
		return '';
	});

	const loading = $derived(!storyRuntime.initialized || storySession.syncing);
	const noStory = $derived(storyRuntime.initialized && storyRuntime.packageId === null);

	const progress = $derived(storyRuntime.progress);
	// Clamped: a story whose last scene is complete must not read "Kapitel 11 von 10".
	const currentChapter = $derived(
		progress ? Math.min(progress.completedSceneCount + 1, Math.max(progress.totalSceneCount, 1)) : 1
	);
	const progressPercent = $derived(
		progress && progress.totalSceneCount > 0
			? Math.round((progress.completedSceneCount / progress.totalSceneCount) * 100)
			: 0
	);

	interface ThreadEntry {
		id: string;
		href: string;
		name: string;
		kind: 'solo' | 'group' | 'system';
		initial?: string;
		count?: string;
		preview: string;
		time: string;
	}

	const storyThreads = $derived.by((): ThreadEntry[] =>
		storyRuntime.threads.map((thread) => {
			const names = thread.participantIds.map((id) => storyRuntime.displayNameFor(id));
			const last = storySession.lastMessageFor(thread.key);
			const preview = loading
				? t('common.loading')
				: !last
					? ''
					: thread.kind === 'group' && last.from !== 'me' && last.from !== 'system'
						? `${storyRuntime.displayNameFor(last.from)}: ${last.text}`
						: last.text;
			return {
				id: thread.key,
				href: `${resolve('/chat')}?thread=${encodeURIComponent(thread.key)}`,
				name: thread.kind === 'group' ? names.join(', ') : (names[0] ?? thread.key),
				kind: thread.kind,
				initial: thread.kind === 'solo' ? (names[0]?.slice(0, 1).toUpperCase() ?? '?') : undefined,
				count: thread.kind === 'group' ? String(thread.participantIds.length + 1) : undefined,
				preview,
				time: last?.time ?? ''
			};
		})
	);

	// The library count is 0 or 1 for most of a device's life, so the plural-only wording of the
	// old mock preview needs singular/empty variants.
	const libraryPreview = $derived.by(() => {
		const count = storyRuntime.installedPackages.length;
		if (count === 0) return t('chats.libraryPreviewEmpty');
		if (count === 1) return t('chats.libraryPreviewSingle');
		return t('chats.libraryPreview', { count });
	});

	const threads = $derived.by((): ThreadEntry[] =>
		[
			...storyThreads,
			{
				id: 'riddlon',
				href: resolve('/chat/riddlon'),
				name: 'Riddlon',
				kind: 'system' as const,
				preview: libraryPreview,
				time: ''
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
	{#if noStory}
		<span class="font-mono text-[9px] tracking-[0.11em] text-slate-600">
			{t('chats.noStoryBand')}
		</span>
	{:else if profile.disguise === 'game' && progress}
		<div class="min-w-0 flex-1">
			<div class="font-mono text-[9px] tracking-[0.11em] text-accent">
				{t('chats.chapterProgress', { chapter: currentChapter, total: progress.totalSceneCount })}
			</div>
			<div class="mt-1 truncate text-label text-slate-400">{storyRuntime.title ?? ''}</div>
		</div>
	{:else if profile.disguise === 'subtle'}
		<div class="flex flex-1 items-center gap-2.5">
			<div class="h-0.5 flex-1 overflow-hidden rounded-full bg-slate-100/10">
				<div class="h-full bg-accent/85" style="width:{progressPercent}%"></div>
			</div>
			<span class="flex-none font-mono text-[9px] tracking-[0.11em] text-slate-500">
				{t('chats.progressPercent', { percent: progressPercent })}
			</span>
		</div>
	{:else}
		<span class="font-mono text-[9px] tracking-[0.11em] text-slate-600">
			{t('chats.chatCount', { count: threads.length })}
		</span>
	{/if}
</InfoBand>

<div class="min-h-0 flex-1 overflow-y-auto py-2">
	{#if noStory}
		<p class="mx-4.5 mt-2 mb-3 text-label leading-relaxed text-slate-500">
			{t('chats.noStoryHint')}
		</p>
	{:else if storyRuntime.initialized && storyThreads.length === 0}
		<!-- A story is active but has introduced nobody yet: honest, and one tap from the library. -->
		<p class="mx-4.5 mt-2 mb-3 text-label leading-relaxed text-slate-500">
			{t('chats.noContactsYetHint')}
		</p>
	{/if}
	{#each threads as thread (thread.id)}
		<ThreadRow
			href={thread.href}
			name={thread.name}
			kind={thread.kind}
			initial={thread.initial}
			count={thread.count}
			preview={thread.preview}
			time={thread.time}
			active={thread.id === activeId}
		/>
	{/each}
</div>
