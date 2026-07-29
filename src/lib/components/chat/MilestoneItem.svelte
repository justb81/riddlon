<script lang="ts">
	import type { Milestone } from '$lib/story/types.js';

	let { milestone }: { milestone: Milestone } = $props();
</script>

<div class="relative pb-6">
	{#if milestone.done}
		<span
			class="absolute top-0.5 -left-[30px] flex size-[19px] items-center justify-center rounded-full bg-accent text-[10px] font-medium text-white"
			>✓</span
		>
	{:else}
		<span
			class="absolute top-0.5 -left-[30px] size-[19px] rounded-full border-[1.5px] border-dashed border-line-strong bg-surface-sunken"
		></span>
	{/if}
	<div class="flex items-baseline gap-2.5">
		<span class="text-h2 font-medium {milestone.done ? 'text-slate-100' : 'text-slate-500'}">
			{milestone.title}
		</span>
		<span class="font-mono text-[9.5px] text-slate-500">{milestone.time}</span>
	</div>
	<div class="mt-1.5 text-label leading-relaxed text-slate-400">{milestone.desc}</div>
	{#if milestone.badge}
		<div
			class="mt-2.5 flex items-center gap-2.5 rounded-tile border border-accent/30 bg-accent/10 px-3 py-2.5"
		>
			<span
				class="flex size-[34px] flex-none items-center justify-center rounded-full border-[1.5px] border-accent font-serif text-[15px] text-accent"
			>
				{milestone.badge.glyph}
			</span>
			<span class="flex-1">
				<span class="block text-label font-medium text-slate-100">{milestone.badge.title}</span>
				<span class="mt-0.5 block text-caption text-slate-400">{milestone.badge.desc}</span>
			</span>
		</div>
	{/if}
</div>
