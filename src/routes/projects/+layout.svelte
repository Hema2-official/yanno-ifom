<script lang="ts">
	import type { Snippet } from 'svelte';
	import TopBar from '$lib/ui/navigation/TopBar.svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="flex h-screen w-full flex-col items-center justify-start">
	<TopBar />

	{@render children()}
</div>
