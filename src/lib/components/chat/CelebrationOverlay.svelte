<script lang="ts">
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { caseSolvedMessage, game } from '$lib/state/game.svelte.js';
</script>

{#if game.celebrationVisible}
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

		<div class="relative">
			<div class="font-mono text-[10.5px] tracking-[0.16em] text-accent">
				{t('celebration.kicker')}
			</div>
			<h2 class="mt-4 font-serif text-[38px] leading-tight text-slate-50">
				{t('celebration.title')}
			</h2>
			<p class="mx-auto mt-3 max-w-[280px] text-body leading-relaxed text-slate-400">
				{caseSolvedMessage}
			</p>

			<div class="mt-6 flex flex-col gap-2">
				{#each game.earned as achievement (achievement.id)}
					<div
						class="flex items-center gap-2.5 rounded-tile border border-line bg-slate-100/5 px-3.5 py-3"
						style="animation:rd-in .4s ease both"
					>
						<span
							class="flex size-[30px] flex-none items-center justify-center rounded-full border-[1.4px] border-accent font-serif text-sm text-accent"
						>
							{achievement.glyph}
						</span>
						<span class="flex-1 text-left text-label font-medium text-slate-100"
							>{achievement.title}</span
						>
						<span class="font-mono text-[9.5px] text-slate-500">{t('common.new')}</span>
					</div>
				{/each}
			</div>

			<div class="mt-7 flex gap-2.5">
				<a
					href={resolve('/story')}
					onclick={() => game.closeCelebration()}
					class="flex-1 rounded-panel bg-accent px-4 py-4 text-center text-label font-medium text-white hover:bg-accent-strong"
				>
					{t('celebration.viewStory')}
				</a>
				<button
					type="button"
					onclick={() => game.closeCelebration()}
					class="flex-none rounded-panel border border-line-strong px-4.5 py-4 text-label font-medium text-slate-200"
				>
					{t('celebration.later')}
				</button>
			</div>
		</div>
	</div>
{/if}
