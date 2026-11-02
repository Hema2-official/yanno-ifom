<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Label } from '$lib/components/ui/label';

	type Props = {
		label: string;
		description?: string;
		/** A short tag after the label, e.g. "hold". */
		badge?: string;
		/** The id of the control the label is for. */
		for?: string;
		children: Snippet;
	};

	let { label, description, badge, for: htmlFor, children }: Props = $props();
</script>

<div class="flex items-center gap-4 py-2">
	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			<Label for={htmlFor} class="font-normal">{label}</Label>
			{#if badge}
				<Badge variant="outline">{badge}</Badge>
			{/if}
		</div>
		{#if description}
			<p class="text-muted-foreground text-xs">{description}</p>
		{/if}
	</div>
	<div class="flex flex-wrap items-center justify-end gap-1.5">
		{@render children()}
	</div>
</div>
