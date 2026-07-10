<script lang="ts">
	import ProjectList from '$lib/ui/menus/projects/remote-projects/ProjectList.svelte';
	import ProjectView from '$lib/ui/menus/projects/remote-projects/ProjectView.svelte';
	import { accountState } from '$lib/states/AccountState.svelte';
	import { createSearchParamsSchema, useSearchParams } from 'runed/kit';

	const paramsSchema = createSearchParamsSchema({
		project: { type: 'string' }
	});

	const params = useSearchParams(paramsSchema);
</script>

<div class="mx-auto mt-[100px] flex w-3/5 flex-col justify-center">
	{#if accountState.currentAccount}
		{#if params.project}
			<ProjectView projectId={params.project} />
		{:else}
			<ProjectList />
		{/if}
	{/if}
</div>
