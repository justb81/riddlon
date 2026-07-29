<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChatList from './ChatList.svelte';
	import { windowChrome } from '$lib/state/windowChrome.svelte.js';

	/**
	 * Responsive app shell around every chat screen.
	 *
	 * Below `lg` this is a pass-through: the route fills the viewport exactly as it
	 * did when the app was phone-only. From `lg` up it becomes the two-pane desktop
	 * layout familiar from WhatsApp/Telegram Web — the chat list docked on the left,
	 * the current route on the right — and from `xl` up the whole thing is capped at
	 * `max-w-frame` and centred on a darker backdrop, instead of stretching a chat
	 * bubble across a 2560px monitor.
	 *
	 * Panes are switched with CSS, not with a JS media query, so there is no layout
	 * flash on load and no resize listener: `<ChatList>` is mounted exactly once and
	 * simply moves from "the whole screen" to "the sidebar".
	 */
	let {
		list = true,
		listPrimary = false,
		children
	}: {
		/** Dock the chat list on the left (desktop only). */
		list?: boolean;
		/** This route *is* the chat list — it owns the full width below `lg`, and the
		 *  right pane shows the placeholder passed as `children` only from `lg` up. */
		listPrimary?: boolean;
		children: Snippet;
	} = $props();
</script>

<div class="app-shell h-dvh w-full bg-surface-sunken xl:p-5" data-wco={windowChrome.visible}>
	<div
		class="app-frame mx-auto flex h-full w-full max-w-frame flex-col overflow-hidden bg-surface xl:rounded-panel xl:border xl:border-line xl:shadow-2xl xl:shadow-black/50"
		data-split={list}
	>
		{#if list && windowChrome.visible}
			<!-- Installed desktop app with Window Controls Overlay: the two-pane layout
			     can't hand its header to the OS titlebar (there are two of them), so the
			     frame grows a drag strip instead — see `.app-frame-titlebar` in layout.css. -->
			<div class="app-frame-titlebar hidden flex-none lg:block"></div>
		{/if}

		<div class="flex min-h-0 flex-1">
			{#if list}
				<aside
					class="{listPrimary
						? 'flex'
						: 'hidden'} min-h-0 w-full flex-col lg:flex lg:w-[336px] lg:flex-none lg:border-r lg:border-line xl:w-[380px] 2xl:w-[420px]"
				>
					<ChatList />
				</aside>
			{/if}

			<main class="{listPrimary ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-1 flex-col">
				{@render children()}
			</main>
		</div>
	</div>
</div>
