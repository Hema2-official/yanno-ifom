<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="flex h-screen w-full flex-col items-center justify-center">
	<img
		src="/logo.svg"
		alt=""
		ondragstart={(e) => e.preventDefault()}
		class="h-[100px] w-[100px]"
	/>
	{@render children()}
</div>
