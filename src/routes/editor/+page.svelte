<script lang="ts">
	import Display from '$lib/ui/annotation/Display.svelte';
	import SideBar from '$lib/ui/navigation/SideBar.svelte';
	import Spinner from '$lib/ui/common/Spinner.svelte';
	import { createSearchParamsSchema, useSearchParams } from 'runed/kit';
	import { projectState } from '$lib/states/ProjectState.svelte';

	const paramsSchema = createSearchParamsSchema({
		project: { type: 'string' },
		version: { type: 'string', default: '' }
	});

	const params = useSearchParams(paramsSchema);

	async function loadProject() {
		const { project, version } = params;
		// Local projects have no versions.
		if (project?.startsWith('local_') && !version) {
			await projectState.loadLocalProject(Number.parseInt(project.replace('local_', '')));
		} else if (project && !project.startsWith('local_') && version) {
			await projectState.loadCloudProject(project, version);
		} else {
			throw new Error("Can't load: invalid project reference.");
		}
	}

	// Loaded once: later changes of the search params don't reload the project
	const loading = loadProject();
</script>

{#await loading}
	<div class="flex h-full flex-col items-center justify-center">
		<Spinner />
	</div>
{:then}
	<!-- Without min-h-0 a long sidebar stretches this past the screen -->
	<div class="flex min-h-0 w-full flex-1 flex-row items-start justify-start">
		<SideBar />
		<div class="order-2 flex h-full flex-1 flex-col items-center">
			<Display />
		</div>
	</div>
{:catch error}
	<div class="flex h-full flex-col items-center justify-center">
		<p class="text-base font-semibold text-red-500">
			{error instanceof Error ? error.message : String(error)}
		</p>
	</div>
{/await}
