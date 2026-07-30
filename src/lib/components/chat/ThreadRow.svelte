<script lang="ts">
	import Avatar from './Avatar.svelte';

	let {
		href,
		name,
		kind,
		initial = '',
		count = '',
		preview,
		time,
		unread = 0,
		active = false
	}: {
		/** Plain string rather than `ResolvedPathname`: story threads are identified by a package
		 *  UUID in a query parameter, not by a prerenderable path segment. */
		href: string;
		name: string;
		kind: 'solo' | 'group' | 'system';
		initial?: string;
		count?: string;
		preview: string;
		time: string;
		unread?: number;
		/** This thread is the one open in the right pane (desktop two-pane layout). */
		active?: boolean;
	} = $props();
</script>

<!-- Callers pass an already-resolved path; the rule can't see through the query string a story
     thread needs, so it is switched off for this one attribute. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	{href}
	aria-current={active ? 'page' : undefined}
	class="flex items-center gap-3.5 px-[22px] py-[13px] hover:bg-slate-100/4 {active
		? 'lg:bg-slate-100/6 lg:shadow-[inset_2px_0_0_var(--color-accent)]'
		: ''}"
>
	<Avatar {kind} {initial} {count} size={46} />
	<span class="flex min-w-0 flex-1 flex-col gap-1">
		<span class="flex items-baseline justify-between gap-2">
			<span class="truncate text-h2 font-medium text-slate-100">{name}</span>
			<span class="flex-none font-mono text-[10.5px] text-slate-500">{time}</span>
		</span>
		<span class="flex items-center gap-2">
			<span class="min-w-0 flex-1 truncate text-body text-slate-400">{preview}</span>
			{#if unread > 0}
				<span
					class="flex h-[19px] min-w-[19px] flex-none items-center justify-center rounded-full bg-accent px-1.5 text-[10.5px] font-medium text-white"
				>
					{unread}
				</span>
			{/if}
		</span>
	</span>
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
