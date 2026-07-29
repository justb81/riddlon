<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Fixed 46px second header row — content varies per screen/disguise mode, height never does. */
	let { children }: { children: Snippet } = $props();
</script>

<div class="flex h-[46px] flex-none items-center gap-2.5 border-b border-line px-4.5 text-caption">
	{@render children()}
</div>
