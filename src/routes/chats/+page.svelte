<script lang="ts">
	import { resolve } from '$app/paths';
	import AppFrame from '$lib/components/chat/AppFrame.svelte';
	import RiddlonMark from '$lib/components/icons/RiddlonMark.svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { storyRuntime } from '$lib/state/engine.svelte.js';

	// The list itself lives in <ChatList>, rendered by <AppFrame>: on phones it fills
	// this screen, on desktop it docks as the sidebar and the placeholder below takes
	// the right pane until a thread is opened.

	// "Open a conversation on the left" is a lie when there is none to open.
	const noStory = $derived(storyRuntime.initialized && storyRuntime.packageId === null);

	$effect(() => {
		void storyRuntime.init();
	});
</script>

<svelte:head><title>{t('chats.title')} · Riddlon</title></svelte:head>

<AppFrame listPrimary>
	<div class="flex h-full flex-col items-center justify-center gap-5 px-10 text-center">
		<div class="opacity-45">
			<RiddlonMark size={72} />
		</div>
		<div>
			<h1 class="font-serif text-display text-slate-200">
				{noStory ? t('story.emptyTitle') : t('chats.emptyTitle')}
			</h1>
			<p class="mx-auto mt-3 max-w-[34ch] text-body leading-relaxed text-slate-500">
				{noStory ? t('chats.noStoryHint') : t('chats.emptyDesc')}
			</p>
		</div>
		{#if noStory}
			<a
				href={resolve('/chat/riddlon')}
				class="rounded-control border border-accent/50 bg-accent/15 px-4 py-2.5 text-label font-medium text-slate-100 hover:bg-accent/25"
			>
				{t('story.emptyAction')}
			</a>
		{/if}
		<div class="mt-2 font-mono text-[10px] tracking-[0.12em] text-slate-600">
			{t('chats.emptyNote')}
		</div>
	</div>
</AppFrame>
