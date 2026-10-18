<script lang="ts">
	import { asset } from '$app/paths';

	let { size = 40, class: className = '' }: { size?: number; class?: string } = $props();
</script>

<img
	src={asset('pwa-icon.svg')}
	alt=""
	width={size}
	height={size}
	class="block flex-none rounded-tile {className}"
/>
