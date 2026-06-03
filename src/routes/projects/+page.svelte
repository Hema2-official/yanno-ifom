<script lang="ts">
	import ProjectList from '$lib/UI/Menus/ProjectList.svelte';
	import ProjectView from '$lib/UI/Menus/ProjectView.svelte';
	import { createSearchParamsSchema, useSearchParams } from 'runed/kit';

	const paramsSchema = createSearchParamsSchema({
		project: { type: 'string' }
	});

	const params = useSearchParams(paramsSchema);
</script>

<div class="flex flex-col justify-center w-3/5 mx-auto mt-[100px]">
	{#if params.project}
		<ProjectView projectId={params.project} />
	{:else}
		<ProjectList />
	{/if}
</div>
