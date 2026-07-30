<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { windowChrome } from '$lib/state/windowChrome.svelte.js';

	/**
	 * Fixed 60px title row, identical height on every screen — see the "Header
	 * überall gleich hoch" feedback in chats/chat1.md. Pair with <InfoBand> below
	 * it (46px) so every screen's chrome totals the same 106px.
	 *
	 * That 60px holds with a collapsed OS titlebar too: below `lg` this row *is* the
	 * titlebar (`data-wco` → `-webkit-app-region: drag`, plus padding that keeps the
	 * `trailing` controls clear of the window buttons — see `.app-header[data-wco]` in
	 * layout.css). Which is why every interactive child needs `.app-header-no-drag`.
	 */
	let {
		onBack,
		backOnDesktop = true,
		leading,
		trailing,
		children
	}: {
		onBack?: () => void;
		/**
		 * Keep the back chevron on the two-pane desktop layout. Set false where the
		 * docked chat list already *is* the way back (the conversation screens) —
		 * a back arrow next to a permanently visible list reads as a dead control.
		 */
		backOnDesktop?: boolean;
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
			class="app-header-no-drag flex-none bg-transparent p-0 font-sans text-2xl leading-none text-slate-400 hover:text-slate-200 {backOnDesktop
				? ''
				: 'lg:hidden'}"
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
