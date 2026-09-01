<script lang="ts">
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { storyRuntime } from '$lib/state/engine.svelte.js';
	import { storySession } from '$lib/state/story-session.svelte.js';

	/**
	 * Shown when the engine reaches one of the active package's `outcomes` — the only
	 * end-of-story signal that comes from real state (#55). Every word here is the story's own:
	 * the ending's `label` and `closingText`, and the achievements the engine actually awarded
	 * from the package's `conditions` (#32). The generic sentence with the interpolated title is
	 * the fallback for a package that ships no closing text, not the normal case.
	 *
	 * `tone` decides whether this reads as a win: reaching an ending is not the same as reaching
	 * a good one, and a story that lets the player accuse the wrong person ends in a setback the
	 * screen must not celebrate.
	 */
	const outcomes = $derived(storyRuntime.outcomes);
	const setback = $derived(outcomes.length > 0 && !storyRuntime.solvedWell);
	/** The ending this screen speaks with. Several outcomes can be reached in one playthrough (a
	 *  wrong accusation on the way to a confession), so a success ending, when there is one, is
	 *  what the player is told about. */
	const headline = $derived(
		outcomes.find((outcome) =>
			setback ? outcome.tone === 'setback' : outcome.tone === 'success'
		) ?? outcomes[0]
	);
	const closingText = $derived(headline?.closingText);
	const earnedAchievements = $derived(storyRuntime.achievements.filter((a) => a.earned));
</script>

{#if storySession.celebrationVisible}
	<div
		class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface px-7.5 py-10 text-center"
		style="animation:rd-fade .35s ease both"
	>
		<div
			class="pointer-events-none absolute inset-0"
			style="background:radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--color-accent) 22%, transparent) 0%, transparent 62%)"
		></div>

		<div class="relative mb-8 flex items-center justify-center">
			<div
				class="absolute size-[216px] rounded-full border border-dashed border-accent/45"
				style="animation:rd-ring 26s linear infinite"
			></div>
			<div class="absolute size-[166px] rounded-full border border-line-strong"></div>
			<div
				class="flex size-[118px] flex-col items-center justify-center rounded-full border-[1.5px] {setback
					? 'border-line-strong bg-slate-100/8'
					: 'border-accent bg-accent/15'}"
				style="animation:rd-pop .55s cubic-bezier(.2,.9,.3,1) both"
			>
				<span class="font-serif text-4xl {setback ? 'text-slate-300' : 'text-accent'}"
					>{setback ? '!' : '✓'}</span
				>
			</div>
		</div>

		<div class="relative w-full max-w-[26rem]">
			<div
				class="font-mono text-[10.5px] tracking-[0.16em] {setback
					? 'text-slate-400'
					: 'text-accent'}"
			>
				{setback ? t('celebration.kickerSetback') : t('celebration.kicker')}
			</div>
			<h2 class="mt-4 font-serif text-[38px] leading-tight text-slate-50">
				{headline?.label ?? (setback ? t('celebration.titleSetback') : t('celebration.title'))}
			</h2>
			<p class="mx-auto mt-3 max-w-[280px] text-body leading-relaxed text-slate-400">
				{closingText ?? t('celebration.desc', { story: storyRuntime.title ?? '' })}
			</p>

			<div class="mt-6 flex flex-col gap-2">
				{#each outcomes as outcome (outcome.id)}
					<div
						class="flex items-center gap-2.5 rounded-tile border border-line bg-slate-100/5 px-3.5 py-3"
						style="animation:rd-in .4s ease both"
					>
						<span
							class="flex size-[30px] flex-none items-center justify-center rounded-full border-[1.4px] font-serif text-sm {outcome.tone ===
							'setback'
								? 'border-line-strong text-slate-300'
								: 'border-accent text-accent'}"
						>
							{outcome.tone === 'setback' ? '!' : '✓'}
						</span>
						<span class="flex-1 text-left text-label font-medium text-slate-100"
							>{outcome.label}</span
						>
						<span class="font-mono text-[9.5px] text-slate-500">{t('common.new')}</span>
					</div>
				{/each}
			</div>

			{#if earnedAchievements.length > 0}
				<h3 class="mt-6 font-mono text-[9.5px] tracking-[0.1em] text-slate-500">
					{t('celebration.achievementsLabel')}
				</h3>
				<div class="mt-2.5 flex flex-col gap-2">
					{#each earnedAchievements as achievement (achievement.id)}
						<div
							class="rounded-tile border border-accent/40 bg-accent/10 px-3.5 py-2.5 text-left"
							style="animation:rd-in .4s ease both"
						>
							<div class="text-label font-medium text-slate-100">{achievement.label}</div>
							{#if achievement.description}
								<div class="mt-1 text-label leading-relaxed text-slate-400">
									{achievement.description}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<div class="mt-7 flex gap-2.5">
				<a
					href={resolve('/story')}
					onclick={() => storySession.closeCelebration()}
					class="flex-1 rounded-panel bg-accent px-4 py-4 text-center text-label font-medium text-white hover:bg-accent-strong"
				>
					{t('celebration.viewStory')}
				</a>
				<button
					type="button"
					onclick={() => storySession.closeCelebration()}
					class="flex-none rounded-panel border border-line-strong px-4.5 py-4 text-label font-medium text-slate-200"
				>
					{t('celebration.later')}
				</button>
			</div>
		</div>
	</div>
{/if}
