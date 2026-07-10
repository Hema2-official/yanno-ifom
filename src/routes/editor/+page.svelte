<script lang="ts">
	import Display from '$lib/ui/annotation/Display.svelte';
	import SideBar from '$lib/ui/navigation/SideBar.svelte';
	import Spinner from '$lib/ui/common/Spinner.svelte';
	import { onMount } from 'svelte';
	import { createSearchParamsSchema, useSearchParams } from 'runed/kit';
	import { projectState } from '$lib/states/ProjectState.svelte';

	let isLoading = $state(true);
	let errorMessage: string | undefined = $state(undefined);

	const paramsSchema = createSearchParamsSchema({
		project: { type: 'string' },
		version: { type: 'string', default: '' }
	});

	const params = useSearchParams(paramsSchema);

	function rejectLoading() {
		errorMessage = "Can't load: invalid project reference.";
	}

	onMount(async () => {
		if (!params.project) return rejectLoading();

		// Local projects have no versions.
		if (params.project.startsWith('local_') && params.version) return rejectLoading();

		try {
			if (params.project.startsWith('local_')) {
				const localProjectId = Number.parseInt(params.project.replace('local_', ''));
				await projectState.loadLocalProject(localProjectId);
			} else {
				if (!params.version) return rejectLoading();
				await projectState.loadCloudProject(params.project, params.version);
			}
		} catch (error: unknown) {
			errorMessage = error instanceof Error ? error.message : String(error);
		} finally {
			isLoading = false;
		}
	});
</script>

{#if errorMessage}
	<div class="flex h-full flex-col items-center justify-center">
		<p class="text-base font-semibold text-red-500">
			{errorMessage}
		</p>
	</div>
{:else if isLoading}
	<div class="flex h-full flex-col items-center justify-center">
		<Spinner />
	</div>
{:else}
	<div class="flex w-full flex-1 flex-row items-start justify-start">
		<SideBar />
		<div class="order-2 flex h-full flex-1 flex-col items-center">
			<Display />
		</div>
	</div>
{/if}
