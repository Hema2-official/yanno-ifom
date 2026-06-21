<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { PlusIcon, RefreshCwIcon } from '@lucide/svelte';

	type Props = {
		title?: string;
		isRefreshing?: boolean;
		onRefresh: () => void;
		onNew: () => void;
	};

	let { title = 'Projects', isRefreshing = false, onRefresh, onNew }: Props = $props();
</script>

<div class="flex items-center justify-between w-full">
	<h2 class="text-3xl font-bold cursor-default">{title}</h2>

	<div class="flex gap-2">
		{#if onRefresh}
			<Button variant="outline" onclick={onRefresh} disabled={isRefreshing}>
				<RefreshCwIcon /> Refresh
			</Button>
		{/if}

		{#if onNew}
			<Button variant="default" onclick={onNew}>
				<PlusIcon /> New
			</Button>
		{/if}
	</div>
</div>
