<script lang="ts">
	export interface Chip {
		id: string;
		label: string;
		onClick: () => void;
	}

	let { chips }: { chips: Chip[] } = $props();
</script>

<div class="flex gap-2 overflow-x-auto pb-[11px]">
	{#each chips as chip (chip.id)}
		<button
			type="button"
			onclick={chip.onClick}
			class="flex-none rounded-full border border-line-strong bg-slate-100/4 px-3.5 py-2 text-label whitespace-nowrap text-slate-200 hover:border-accent/50 hover:bg-accent/15"
		>
			{chip.label}
		</button>
	{/each}
</div>
