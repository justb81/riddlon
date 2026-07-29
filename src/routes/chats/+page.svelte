<script lang="ts">
	import AppFrame from '$lib/components/chat/AppFrame.svelte';
	import RiddlonMark from '$lib/components/icons/RiddlonMark.svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';

	// The list itself lives in <ChatList>, rendered by <AppFrame>: on phones it fills
	// this screen, on desktop it docks as the sidebar and the placeholder below takes
	// the right pane until a thread is opened.
</script>

<svelte:head><title>{t('chats.title')} · Riddlon</title></svelte:head>

<AppFrame listPrimary>
	<div class="flex h-full flex-col items-center justify-center gap-5 px-10 text-center">
		<div class="opacity-45">
			<RiddlonMark size={72} />
		</div>
		<div>
			<h1 class="font-serif text-display text-slate-200">{t('chats.emptyTitle')}</h1>
			<p class="mx-auto mt-3 max-w-[34ch] text-body leading-relaxed text-slate-500">
				{t('chats.emptyDesc')}
			</p>
		</div>
		<div class="mt-2 font-mono text-[10px] tracking-[0.12em] text-slate-600">
			{t('chats.emptyNote')}
		</div>
	</div>
</AppFrame>
