<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import AppFrame from '$lib/components/chat/AppFrame.svelte';
	import AppHeader from '$lib/components/chat/AppHeader.svelte';
	import InfoBand from '$lib/components/chat/InfoBand.svelte';
	import Avatar from '$lib/components/chat/Avatar.svelte';
	import MessageBubble from '$lib/components/chat/MessageBubble.svelte';
	import TypingIndicator from '$lib/components/chat/TypingIndicator.svelte';
	import Composer from '$lib/components/chat/Composer.svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { game } from '$lib/state/game.svelte.js';
	import { storyRuntime } from '$lib/state/engine.svelte.js';
	import { profile } from '$lib/state/profile.svelte.js';
	import {
		CHARACTERS,
		GROUP_THREAD_META,
		GROUP_CHIPS,
		LUCY_THREAD_META,
		SOLO_CHIPS
	} from '$lib/story/lucys-portmonnaie.js';
	import { PACKAGE_ID as REFERENCE_PACKAGE_ID } from '$lib/story/reference-package.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	// This screen's chat content (`game.svelte.ts`) is authored only for the reference story —
	// pin the runtime back to it on entry so a session switched elsewhere (e.g. opening a
	// different package's `/story` overview from `/chat/riddlon`, #37) never leaks its save/
	// engine into Lucy's/the group's chat.
	$effect(() => {
		void storyRuntime.switchTo(REFERENCE_PACKAGE_ID);
	});
	const thread = $derived(data.thread);
	const isGroup = $derived(thread === 'group');

	const title = $derived(isGroup ? GROUP_THREAD_META.name : LUCY_THREAD_META.name);
	const subtitle = $derived(
		isGroup ? GROUP_THREAD_META.memberSummary : `zuletzt online ${LUCY_THREAD_META.lastOnline}`
	);
	const lastOnlineTime = $derived(
		isGroup ? (game.messagesFor('group').at(-1)?.time ?? '') : LUCY_THREAD_META.lastOnline
	);

	const messages = $derived(game.messagesFor(thread));
	const typing = $derived(game.typingFor(thread));
	const openFlagId = $derived(game.openFlagFor(thread));
	const chips = $derived(
		(isGroup ? GROUP_CHIPS : SOLO_CHIPS).map((chip) => ({
			id: chip.id,
			label: chip.label,
			onClick: () => game.send(thread, chip.label)
		}))
	);

	const showClueStrip = $derived(profile.disguise !== 'pure');
	const openContradictions = $derived(game.solved ? 0 : 1);
	const doneMilestones = $derived(game.milestones.filter((m) => m.done).length);

	let draft = $state('');
	let scrollEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		// `messages.length` is read here only to make the effect re-run on new messages.
		if (scrollEl && messages.length >= 0) scrollEl.scrollTop = scrollEl.scrollHeight;
	});

	function send(): void {
		game.send(thread, draft);
		draft = '';
	}

	function showName(index: number): boolean {
		if (!isGroup) return false;
		const m = messages[index];
		if (m.from === 'me' || m.from === 'system') return false;
		const prev = messages
			.slice(0, index)
			.reverse()
			.find((x) => x.from !== 'system');
		return !prev || prev.from !== m.from;
	}
</script>

<svelte:head><title>{title} · Riddlon</title></svelte:head>

<AppFrame>
	<AppHeader onBack={() => goto(resolve('/chats'))} backOnDesktop={false}>
		{#snippet leading()}
			{#if isGroup}
				<Avatar kind="group" count="4" size={36} fontSize={11} shape="tile" />
			{:else}
				<Avatar kind="solo" initial={CHARACTERS.lucy.initial} size={36} fontSize={14} />
			{/if}
		{/snippet}
		<span class="block truncate text-h1 font-medium text-slate-100">{title}</span>
		<span class="mt-0.5 block truncate text-label text-slate-500">{subtitle}</span>
	</AppHeader>

	<InfoBand>
		{#if showClueStrip}
			<a href={resolve('/story')} class="flex h-full w-full items-center gap-2.5 text-left">
				<span class="flex-none font-mono text-[9px] tracking-[0.11em] text-accent">
					{t('convo.clueCount', { revealed: doneMilestones, total: game.milestones.length })}
				</span>
				<span class="flex-1 text-label text-slate-300">
					{openContradictions === 1
						? t('convo.contradictionsOpen', { count: openContradictions })
						: t('convo.contradictionsOpenPlural', { count: openContradictions })}
				</span>
				<span class="text-body text-slate-500">›</span>
			</a>
		{:else}
			<span class="font-mono text-[9px] tracking-[0.11em] text-slate-500">
				{t('convo.lastOnline', { time: lastOnlineTime })}
			</span>
		{/if}
	</InfoBand>

	<div bind:this={scrollEl} class="min-h-0 flex-1 overflow-y-auto">
		<div class="mx-auto flex w-full max-w-chat flex-col px-4.5 pt-4.5 pb-2.5 lg:px-6">
			{#each messages as message, index (message.id)}
				<MessageBubble
					{message}
					showName={showName(index)}
					open={openFlagId === message.id}
					onToggleFlag={() => game.toggleFlag(thread, message.id)}
				/>
			{/each}
			{#if typing}
				<TypingIndicator />
			{/if}
			<div class="h-1.5 flex-none"></div>
		</div>
	</div>

	<Composer bind:draft {chips} placeholder={t('convo.messagePlaceholder')} onSend={send} />
</AppFrame>
