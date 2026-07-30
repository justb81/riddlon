<script lang="ts">
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { storyRuntime } from '$lib/state/engine.svelte.js';
	import { storySession } from '$lib/state/story-session.svelte.js';

	/**
	 * Shown when the engine reaches one of the active package's `outcomes` — the only
	 * end-of-story signal that comes from real state. The closing text used to be an authored
	 * string from the built-in demo; it is now the reached outcome plus the story's own title,
	 * because a package cannot yet say what its ending should read like.
	 */
	const outcomes = $derived(storyRuntime.outcomes);
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
				class="flex size-[118px] flex-col items-center justify-center rounded-full border-[1.5px] border-accent bg-accent/15"
				style="animation:rd-pop .55s cubic-bezier(.2,.9,.3,1) both"
			>
				<span class="font-serif text-4xl text-accent">✓</span>
			</div>
		</div>

		<div class="relative w-full max-w-[26rem]">
			<div class="font-mono text-[10.5px] tracking-[0.16em] text-accent">
				{t('celebration.kicker')}
			</div>
			<h2 class="mt-4 font-serif text-[38px] leading-tight text-slate-50">
				{t('celebration.title')}
			</h2>
			<p class="mx-auto mt-3 max-w-[280px] text-body leading-relaxed text-slate-400">
				{t('celebration.desc', { story: storyRuntime.title ?? '' })}
			</p>

			<div class="mt-6 flex flex-col gap-2">
				{#each outcomes as outcome (outcome.id)}
					<div
						class="flex items-center gap-2.5 rounded-tile border border-line bg-slate-100/5 px-3.5 py-3"
						style="animation:rd-in .4s ease both"
					>
						<span
							class="flex size-[30px] flex-none items-center justify-center rounded-full border-[1.4px] border-accent font-serif text-sm text-accent"
						>
							✓
						</span>
						<span class="flex-1 text-left text-label font-medium text-slate-100">{outcome.id}</span>
						<span class="font-mono text-[9.5px] text-slate-500">{t('common.new')}</span>
					</div>
				{/each}
			</div>

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
