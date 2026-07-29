<script lang="ts">
	import ChipRow, { type Chip } from './ChipRow.svelte';

	let {
		chips,
		draft = $bindable(''),
		onSend,
		placeholder
	}: {
		chips?: Chip[];
		draft?: string;
		onSend: () => void;
		placeholder: string;
	} = $props();

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			onSend();
		}
	}
</script>

<!-- The generous bottom padding is thumb/home-indicator room on a phone; a desktop
     window has neither, so it tightens up once the pointer takes over. -->
<div class="flex-none border-t border-line bg-surface px-3.5 pt-[11px] pb-[22px] lg:px-6 lg:pb-3.5">
	<div class="mx-auto w-full max-w-chat">
		{#if chips && chips.length > 0}
			<ChipRow {chips} />
		{/if}
		<div class="flex items-end gap-[9px]">
			<input
				bind:value={draft}
				onkeydown={handleKeydown}
				{placeholder}
				class="min-w-0 flex-1 rounded-full border border-line-strong bg-slate-100/5 px-[15px] py-[13px] text-body text-slate-100 placeholder:text-slate-500 focus:border-accent/60 focus:outline-none"
			/>
			<button
				type="button"
				onclick={onSend}
				aria-label="Senden"
				class="flex size-[46px] flex-none items-center justify-center rounded-full bg-accent text-lg text-white hover:bg-accent-strong"
			>
				↑
			</button>
		</div>
	</div>
</div>
