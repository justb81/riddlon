<script lang="ts">
	import RiddlonMark from '$lib/components/icons/RiddlonMark.svelte';

	type AvatarKind = 'solo' | 'group' | 'system' | 'cover';

	let {
		kind,
		initial = '',
		count = '',
		size = 46,
		fontSize,
		shape = 'circle'
	}: {
		kind: AvatarKind;
		initial?: string;
		count?: string;
		size?: number;
		fontSize?: number;
		shape?: 'circle' | 'tile';
	} = $props();

	const resolvedFontSize = $derived(fontSize ?? Math.round(size * 0.34));
	const radius = $derived(shape === 'circle' ? '9999px' : 'var(--radius-tile)');
</script>

{#if kind === 'system'}
	<RiddlonMark {size} />
{:else if kind === 'group'}
	<span
		style="width:{size}px;height:{size}px;border-radius:{radius};font-size:{resolvedFontSize}px"
		class="flex flex-none items-center justify-center border border-accent/40 bg-accent/15 font-mono font-medium text-accent"
	>
		{count}
	</span>
{:else if kind === 'cover'}
	<span
		style="width:{size}px;height:{size}px;border-radius:{radius};background:repeating-linear-gradient(115deg,var(--color-surface-raised) 0 7px,var(--color-surface-sunken) 7px 14px)"
		class="block flex-none border border-line"
		aria-hidden="true"
	></span>
{:else}
	<span
		style="width:{size}px;height:{size}px;border-radius:{radius};font-size:{resolvedFontSize}px"
		class="flex flex-none items-center justify-center bg-surface-raised font-medium text-slate-100/80"
	>
		{initial}
	</span>
{/if}
