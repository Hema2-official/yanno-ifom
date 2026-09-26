<script lang="ts">
	import type { Snippet } from 'svelte';

	let { heading, children }: { heading?: string; children: Snippet } = $props();
</script>

<div>
	{#if heading}
		<h4 class="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
			{heading}
		</h4>
	{/if}
	<div class="divide-y">
		{@render children()}
	</div>
</div>
