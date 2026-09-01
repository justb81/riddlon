<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import AppFrame from '$lib/components/chat/AppFrame.svelte';
	import AppHeader from '$lib/components/chat/AppHeader.svelte';
	import InfoBand from '$lib/components/chat/InfoBand.svelte';
	import Avatar from '$lib/components/chat/Avatar.svelte';
	import MilestoneItem from '$lib/components/chat/MilestoneItem.svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { storyRuntime } from '$lib/state/engine.svelte.js';
	import type { Milestone } from '$lib/story/types.js';

	/**
	 * The case file for the active package. Everything here is engine state: the timeline is the
	 * authored scene graph, the clue list is `EngineState.clues`, and the achievements are the
	 * package's own declarations plus what the engine awarded from their `conditions` (#32) —
	 * this screen never decides on a story's behalf what counts as earned, which is exactly what
	 * the deleted demo module used to do.
	 */

	const ready = $derived(storyRuntime.initialized);
	const noStory = $derived(ready && storyRuntime.packageId === null);

	const progress = $derived(storyRuntime.progress);
	const totalScenes = $derived(progress?.totalSceneCount ?? 0);
	const currentScene = $derived(
		progress ? Math.min(progress.completedSceneCount + 1, Math.max(totalScenes, 1)) : 1
	);
	const doneScenes = $derived(progress?.completedSceneCount ?? 0);
	const donePercent = $derived(totalScenes > 0 ? (doneScenes / totalScenes) * 100 : 0);

	const title = $derived(storyRuntime.title ?? '');
	const contactCount = $derived(storyRuntime.cast.length);
	const tags = $derived(storyRuntime.tags);

	/** Scene → timeline row. The format has no scene titles, so the position is the title and the
	 *  participants are the description — reported structure, not invented structure. */
	const milestones = $derived.by((): Milestone[] =>
		storyRuntime.scenes.map((scene) => ({
			id: scene.id,
			title: t('story.chapterN', { chapter: scene.index }),
			time: storyRuntime.sceneTimes[scene.id] ?? (scene.current ? t('story.chapterNow') : '—'),
			done: scene.done,
			desc:
				scene.participantIds.map((id) => storyRuntime.displayNameFor(id)).join(', ') ||
				t('story.chapterNoParticipants')
		}))
	);

	const clues = $derived.by(() =>
		Object.entries(storyRuntime.clueDisplays)
			.map(([id, display]) => ({ id, ...display }))
			.filter((clue) => clue.sources.length > 0)
	);

	const firstThreadHref = $derived.by(() => {
		const thread = storyRuntime.threads[0];
		return thread ? `${resolve('/chat')}?thread=${encodeURIComponent(thread.key)}` : null;
	});

	$effect(() => {
		void storyRuntime.init();
	});
</script>

<svelte:head><title>{t('story.title')} · Riddlon</title></svelte:head>

<AppFrame>
	<AppHeader onBack={() => goto(resolve('/chat/riddlon'))}>
		<span class="block text-center text-h1 font-medium text-slate-100">{t('story.title')}</span>
		{#snippet trailing()}
			{#if ready && !noStory}
				<span class="font-mono text-caption text-slate-500">{doneScenes}/{totalScenes}</span>
			{/if}
		{/snippet}
	</AppHeader>

	<InfoBand>
		<span class="font-mono text-[9px] tracking-[0.11em] text-slate-600">
			{noStory
				? t('chats.noStoryBand')
				: t('story.chapterInfo', {
						story: title.toUpperCase(),
						chapter: currentScene,
						total: totalScenes
					})}
		</span>
	</InfoBand>

	{#if noStory}
		<div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-10 text-center">
			<h2 class="font-serif text-display text-slate-200">{t('story.emptyTitle')}</h2>
			<p class="max-w-[34ch] text-body leading-relaxed text-slate-500">{t('story.emptyDesc')}</p>
			<button
				type="button"
				onclick={() => goto(resolve('/chat/riddlon'))}
				class="mt-1 rounded-control border border-accent/50 bg-accent/15 px-4 py-2.5 text-label font-medium text-slate-100 hover:bg-accent/25"
			>
				{t('story.emptyAction')}
			</button>
		</div>
	{:else}
		<div class="min-h-0 flex-1 overflow-y-auto">
			<div class="mx-auto w-full max-w-pane px-5.5 pt-5.5 pb-7.5">
				<div class="rounded-panel border border-line bg-surface-raised p-4">
					<div class="flex items-center gap-3.5">
						<Avatar kind="cover" size={54} shape="tile" />
						<span class="min-w-0 flex-1">
							<span class="block text-h2 font-medium text-slate-100">{title}</span>
							<span class="mt-1 block text-label text-slate-400">
								{t('story.chapterOf', { chapter: currentScene, total: totalScenes })} ·
								{t('story.contactCount', { count: contactCount })}
							</span>
							{#if tags.length > 0}
								<!-- Authored classification from the manifest (#53) — the app has no genre of
								     its own to assert about a package any more. -->
								<span class="mt-2 flex flex-wrap gap-1.5">
									{#each tags as tag (tag)}
										<span
											class="rounded-full border border-line px-2 py-0.5 font-mono text-[9.5px] tracking-[0.06em] text-slate-400"
											>{tag}</span
										>
									{/each}
								</span>
							{/if}
						</span>
					</div>
					{#if ready}
						<div class="mt-4 flex items-end gap-3">
							<div class="font-serif text-[32px] leading-none text-slate-50">
								{progress?.knownClueCount ?? 0} / {progress?.totalClueCount ?? 0}
							</div>
							<div class="pb-0.5 text-label text-slate-400">{t('story.cluesFound')}</div>
						</div>
						{#if firstThreadHref}
							<!-- Built from resolve('/chat') plus the thread key; the rule can't see through
							     the query string, so it is switched off for this one link. -->
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								href={firstThreadHref}
								class="mt-4 block w-full rounded-tile border border-accent/50 bg-accent/15 py-3.5 text-center text-label font-medium text-slate-100 hover:bg-accent/25"
							>
								{t('story.continue', { chapter: currentScene })}
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/if}
					{/if}
				</div>

				{#if !ready}
					<p class="mt-6.5 text-label leading-relaxed text-slate-500">{t('common.loading')}</p>
				{:else}
					<div class="relative mt-6.5 pl-[30px]">
						<div
							class="absolute top-1.5 bottom-3 left-[9px] w-[1.5px]"
							style="background:linear-gradient(180deg, var(--color-accent) 0%, var(--color-accent) {donePercent}%, var(--color-line) {donePercent}%, var(--color-line) 100%)"
						></div>
						{#each milestones as milestone (milestone.id)}
							<MilestoneItem {milestone} />
						{/each}
					</div>

					{#if clues.length > 0}
						<h3 class="mt-2 font-mono text-[9.5px] tracking-[0.1em] text-slate-500">
							{t('story.cluesLabel')}
						</h3>
						<div class="mt-2.5 flex flex-col gap-2.5">
							{#each clues as clue (clue.id)}
								<div class="rounded-tile border border-line bg-surface-raised p-3">
									<div class="flex items-baseline gap-2">
										<span class="flex-1 text-label font-medium text-slate-100"
											>{clue.clueLabel}</span
										>
										{#if clue.conflicting && !clue.resolved}
											<span class="font-mono text-[9.5px] text-accent"
												>{t('story.clueConflict')}</span
											>
										{/if}
									</div>
									{#each clue.sources as source (source.characterId + source.value)}
										<div class="mt-1.5 text-label text-slate-400">
											<span class="text-slate-200">{source.who}:</span>
											{source.value}
										</div>
									{/each}
								</div>
							{/each}
						</div>
					{/if}

					<h3 class="mt-6 font-mono text-[9.5px] tracking-[0.1em] text-slate-500">
						{t('story.achievementsLabel')}
					</h3>
					{#if storyRuntime.achievements.length === 0}
						<p class="mt-2 text-label leading-relaxed text-slate-500">
							{t('story.noAchievementsInPackage')}
						</p>
					{:else}
						<div class="mt-2.5 flex flex-col gap-2.5">
							{#each storyRuntime.achievements as achievement (achievement.id)}
								<div
									class="rounded-tile border p-3 {achievement.earned
										? 'border-accent/40 bg-accent/10'
										: 'border-line bg-surface-raised'}"
								>
									<div class="flex items-baseline gap-2">
										<span class="flex-1 text-label font-medium text-slate-100"
											>{achievement.label}</span
										>
										{#if achievement.earned}
											<span class="font-mono text-[9.5px] text-accent"
												>{t('story.achievementEarned')}</span
											>
										{/if}
									</div>
									{#if achievement.description}
										<div class="mt-1 text-label leading-relaxed text-slate-400">
											{achievement.description}
										</div>
									{/if}
									{#if !achievement.awardable}
										<!-- The package names this ending but never says when it is earned, so
										     nothing can award it — say so instead of showing an open checkbox
										     the player can never tick (#32). -->
										<div class="mt-1 text-label leading-relaxed text-slate-500">
											{t('story.achievementDecorative')}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</AppFrame>
