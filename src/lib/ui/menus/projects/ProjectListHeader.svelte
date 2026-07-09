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
			<Button variant="secondary" onclick={onRefresh} disabled={isRefreshing}>
				<RefreshCwIcon data-icon="inline-start" /> Refresh
			</Button>
		{/if}

		{#if onNew}
			<Button variant="default" onclick={onNew}>
				<PlusIcon data-icon="inline-start" /> New
			</Button>
		{/if}
	</div>
</div>
