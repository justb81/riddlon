<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import AppFrame from '$lib/components/chat/AppFrame.svelte';
	import AppHeader from '$lib/components/chat/AppHeader.svelte';
	import InfoBand from '$lib/components/chat/InfoBand.svelte';
	import Avatar from '$lib/components/chat/Avatar.svelte';
	import MilestoneItem from '$lib/components/chat/MilestoneItem.svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { game } from '$lib/state/game.svelte.js';
	import { storyRuntime } from '$lib/state/engine.svelte.js';
	import { STORY_META } from '$lib/story/lucys-portmonnaie.js';

	const total = $derived(game.milestones.length);
	const done = $derived(game.milestones.filter((m) => m.done).length);
	const donePercent = $derived(total > 0 ? (done / total) * 100 : 0);

	// Real scene progress from the engine, not the mock's fixed chapter numbers — falls back
	// to STORY_META's flavor numbers only until `storyRuntime` has finished loading.
	const totalScenes = $derived(storyRuntime.progress?.totalSceneCount ?? STORY_META.totalChapters);
	const currentScene = $derived(
		storyRuntime.progress
			? storyRuntime.progress.completedSceneCount + 1
			: STORY_META.currentChapter
	);
</script>

<svelte:head><title>{t('story.title')} · Riddlon</title></svelte:head>

<AppFrame>
	<AppHeader onBack={() => goto(resolve('/chat/riddlon'))}>
		<span class="block text-center text-h1 font-medium text-slate-100">{t('story.title')}</span>
		{#snippet trailing()}
			<span class="font-mono text-caption text-slate-500">{done}/{total}</span>
		{/snippet}
	</AppHeader>

	<InfoBand>
		<span class="font-mono text-[9px] tracking-[0.11em] text-slate-600">
			{t('story.chapterInfo', {
				story: STORY_META.title.toUpperCase(),
				chapter: currentScene,
				total: totalScenes
			})}
		</span>
	</InfoBand>

	<div class="min-h-0 flex-1 overflow-y-auto">
		<div class="mx-auto w-full max-w-pane px-5.5 pt-5.5 pb-7.5">
			<div class="rounded-panel border border-line bg-surface-raised p-4">
				<div class="flex items-center gap-3.5">
					<Avatar kind="cover" size={54} shape="tile" />
					<span class="min-w-0 flex-1">
						<span class="block text-h2 font-medium text-slate-100">{STORY_META.title}</span>
						<span class="mt-1 block text-label text-slate-400">
							{STORY_META.genre} · Kapitel {currentScene} von {totalScenes}
							·
							{STORY_META.contactCount} Kontakte
						</span>
					</span>
				</div>
				<div class="mt-4 flex items-end gap-3">
					<div class="font-serif text-[32px] leading-none text-slate-50">{done} / {total}</div>
					<div class="pb-0.5 text-label text-slate-400">{t('story.milestonesReached')}</div>
				</div>
				<button
					type="button"
					onclick={() => goto(resolve('/chat/[thread]', { thread: 'lucy' }))}
					class="mt-4 w-full rounded-tile border border-accent/50 bg-accent/15 py-3.5 text-label font-medium text-slate-100 hover:bg-accent/25"
				>
					{t('story.continue', { chapter: currentScene })}
				</button>
			</div>

			<div class="relative mt-6.5 pl-[30px]">
				<div
					class="absolute top-1.5 bottom-3 left-[9px] w-[1.5px]"
					style="background:linear-gradient(180deg, var(--color-accent) 0%, var(--color-accent) {donePercent}%, var(--color-line) {donePercent}%, var(--color-line) 100%)"
				></div>
				{#each game.milestones as milestone (milestone.id)}
					<MilestoneItem {milestone} />
				{/each}
			</div>
		</div>
	</div>
</AppFrame>
