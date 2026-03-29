<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="flex flex-col items-center justify-center h-screen w-full">
	<img
		src="/logo.svg"
		alt=""
		ondragstart={(e) => e.preventDefault()}
		class="w-[100px] h-[100px]"
	/>
	{@render children()}
</div>
