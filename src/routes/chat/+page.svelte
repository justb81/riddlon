<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AppFrame from '$lib/components/chat/AppFrame.svelte';
	import AppHeader from '$lib/components/chat/AppHeader.svelte';
	import InfoBand from '$lib/components/chat/InfoBand.svelte';
	import Avatar from '$lib/components/chat/Avatar.svelte';
	import MessageBubble from '$lib/components/chat/MessageBubble.svelte';
	import TypingIndicator from '$lib/components/chat/TypingIndicator.svelte';
	import Composer from '$lib/components/chat/Composer.svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { storyRuntime } from '$lib/state/engine.svelte.js';
	import { storySession } from '$lib/state/story-session.svelte.js';
	import { profile } from '$lib/state/profile.svelte.js';
	import { isCharacterSpeaker } from '$lib/story/types.js';

	/**
	 * One conversation — solo or group, same shell.
	 *
	 * The thread is a query parameter, not a route segment: thread keys are character/scene UUIDs
	 * from whatever package is installed, and `adapter-static` (no fallback) can only prerender a
	 * fixed set of path segments. A single prerendered `/chat` route keeps arbitrary keys working
	 * offline without an SPA fallback or a service-worker navigation handler.
	 */
	const threadKey = $derived(page.url.searchParams.get('thread') ?? '');
	const thread = $derived(storyRuntime.threadFor(threadKey));
	const isGroup = $derived(thread?.kind === 'group');

	// Gate on both singletons: `storySession.init()` awaits `storyRuntime.init()` and finishes a
	// moment after it, and a direct navigation or reload lands exactly in that gap.
	const ready = $derived(storyRuntime.initialized && storySession.initialized);
	const unknownThread = $derived(ready && !storySession.syncing && !thread);

	const participants = $derived(
		(thread?.participantIds ?? []).map((id) => ({ id, name: storyRuntime.displayNameFor(id) }))
	);
	const title = $derived(
		isGroup
			? participants.map((p) => p.name).join(', ')
			: (participants[0]?.name ?? t('convo.unknownThreadTitle'))
	);
	const subtitle = $derived(
		isGroup
			? t('convo.memberSummary', { count: participants.length + 1 })
			: (storyRuntime.title ?? '')
	);

	const messages = $derived(threadKey ? storySession.messagesFor(threadKey) : []);
	const typing = $derived(threadKey ? storySession.typingFor(threadKey) : false);

	const showClueStrip = $derived(profile.disguise !== 'pure');
	const progress = $derived(storyRuntime.progress);
	const openContradictions = $derived(progress?.openContradictionCount ?? 0);

	// A model is what produces every message here, so its absence is worth saying out loud
	// rather than leaving the thread mysteriously silent.
	const noModelNote = $derived(storySession.errorCode === 'no-model');

	let draft = $state('');
	let scrollEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		void storyRuntime.init();
	});

	$effect(() => {
		// Writes the scene's opening message the first time it is opened — a package ships no
		// authored dialogue, so nothing would otherwise ever arrive unprompted.
		if (threadKey && ready) void storySession.openThread(threadKey);
	});

	$effect(() => {
		// `messages.length` is read here only to make the effect re-run on new messages.
		if (scrollEl && messages.length >= 0) scrollEl.scrollTop = scrollEl.scrollHeight;
	});

	function send(): void {
		const text = draft;
		draft = '';
		void storySession.send(threadKey, text);
	}

	function showName(index: number): boolean {
		if (!isGroup) return false;
		const message = messages[index];
		if (!isCharacterSpeaker(message.from)) return false;
		const prev = messages
			.slice(0, index)
			.reverse()
			.find((m) => m.from !== 'system');
		return !prev || prev.from !== message.from;
	}
</script>

<svelte:head><title>{title} · Riddlon</title></svelte:head>

<AppFrame>
	<AppHeader onBack={() => goto(resolve('/chats'))} backOnDesktop={false}>
		{#snippet leading()}
			{#if isGroup}
				<Avatar
					kind="group"
					count={String(participants.length + 1)}
					size={36}
					fontSize={11}
					shape="tile"
				/>
			{:else}
				<Avatar kind="solo" initial={title.slice(0, 1).toUpperCase()} size={36} fontSize={14} />
			{/if}
		{/snippet}
		<span class="block truncate text-h1 font-medium text-slate-100">{title}</span>
		<span class="mt-0.5 block truncate text-label text-slate-500">{subtitle}</span>
	</AppHeader>

	<InfoBand>
		{#if !ready}
			<span class="font-mono text-[9px] tracking-[0.11em] text-slate-500">
				{t('common.loading')}
			</span>
		{:else if showClueStrip && progress}
			<a href={resolve('/story')} class="flex h-full w-full items-center gap-2.5 text-left">
				<span class="flex-none font-mono text-[9px] tracking-[0.11em] text-accent">
					{t('convo.clueCount', {
						revealed: progress.knownClueCount,
						total: progress.totalClueCount
					})}
				</span>
				<span class="flex-1 text-label text-slate-300">
					{openContradictions === 0
						? t('convo.contradictionsNone')
						: openContradictions === 1
							? t('convo.contradictionsOpen', { count: openContradictions })
							: t('convo.contradictionsOpenPlural', { count: openContradictions })}
				</span>
				<span class="text-body text-slate-500">›</span>
			</a>
		{:else}
			<span class="font-mono text-[9px] tracking-[0.11em] text-slate-500">
				{storyRuntime.title ?? ''}
			</span>
		{/if}
	</InfoBand>

	{#if unknownThread}
		<div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-10 text-center">
			<h2 class="font-serif text-display text-slate-200">{t('convo.unknownThreadTitle')}</h2>
			<p class="max-w-[34ch] text-body leading-relaxed text-slate-500">
				{t('convo.unknownThreadDesc')}
			</p>
			<button
				type="button"
				onclick={() => goto(resolve('/chats'))}
				class="mt-1 rounded-control border border-accent/50 bg-accent/15 px-4 py-2.5 text-label font-medium text-slate-100 hover:bg-accent/25"
			>
				{t('convo.backToChats')}
			</button>
		</div>
	{:else}
		<div bind:this={scrollEl} class="min-h-0 flex-1 overflow-y-auto">
			<div class="mx-auto flex w-full max-w-chat flex-col px-4.5 pt-4.5 pb-2.5 lg:px-6">
				{#if ready}
					{#each messages as message, index (message.id)}
						<MessageBubble
							{message}
							speakerName={storyRuntime.displayNameFor(message.from)}
							showName={showName(index)}
							open={storySession.openClueMessageId === message.id}
							onToggleFlag={() => storySession.toggleClue(message.id)}
						/>
					{/each}
					{#if typing}
						<TypingIndicator />
					{/if}
					{#if noModelNote}
						<p
							class="my-2.5 max-w-[80%] self-center rounded-control bg-slate-100/6 px-3 py-2 text-center font-mono text-[10.5px] leading-snug text-slate-400"
						>
							{t('convo.noModelNote')}
						</p>
					{/if}
				{/if}
				<div class="h-1.5 flex-none"></div>
			</div>
		</div>

		<Composer bind:draft placeholder={t('convo.messagePlaceholder')} onSend={send} />
	{/if}
</AppFrame>
