<script lang="ts">
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { game } from '$lib/state/game.svelte.js';
</script>

{#if game.achievementToast}
	{@const toast = game.achievementToast}
	<div
		class="pointer-events-none fixed inset-x-4 top-4 z-40 flex justify-center"
		style="animation:rd-toast .38s cubic-bezier(.2,.9,.3,1) both"
	>
		<div
			class="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-panel border border-accent/45 bg-surface-raised px-3.5 py-3 shadow-lg shadow-black/40"
		>
			<span
				class="flex size-9 flex-none items-center justify-center rounded-full border-[1.5px] border-accent bg-accent/15 font-serif text-base text-accent"
			>
				{toast.glyph}
			</span>
			<span class="min-w-0 flex-1">
				<span class="block font-mono text-[9.5px] tracking-wide text-accent"
					>{t('toast.achievement')}</span
				>
				<span class="mt-1 block truncate text-label font-medium text-slate-100">{toast.text}</span>
			</span>
			<a
				href={resolve('/story')}
				class="flex-none rounded-control border border-line-strong px-2.5 py-1.5 text-label font-medium text-slate-200 hover:bg-slate-100/10"
			>
				{t('toast.overview')}
			</a>
		</div>
	</div>
{/if}
