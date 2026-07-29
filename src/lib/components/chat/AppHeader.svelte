<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { windowChrome } from '$lib/state/windowChrome.svelte.js';

	/**
	 * Fixed 60px title row, identical height on every screen — see the "Header
	 * überall gleich hoch" feedback in chats/chat1.md. Pair with <InfoBand> below
	 * it (46px) so every screen's chrome totals the same 106px.
	 */
	let {
		onBack,
		leading,
		trailing,
		children
	}: {
		onBack?: () => void;
		leading?: Snippet;
		trailing?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<header
	class="app-header flex h-15 flex-none items-center gap-3 border-b border-line bg-surface px-4.5"
	data-wco={windowChrome.visible}
>
	{#if onBack}
		<button
			type="button"
			onclick={onBack}
			aria-label={t('common.back')}
			class="app-header-no-drag flex-none bg-transparent p-0 font-sans text-2xl leading-none text-slate-400 hover:text-slate-200"
		>
			‹
		</button>
	{/if}
	{#if leading}
		<div class="app-header-no-drag flex flex-none items-center">
			{@render leading()}
		</div>
	{/if}
	<div class="app-header-no-drag min-w-0 flex-1">
		{#if children}{@render children()}{/if}
	</div>
	{#if trailing}
		<div class="app-header-no-drag flex flex-none items-center gap-2">
			{@render trailing()}
		</div>
	{/if}
</header>
