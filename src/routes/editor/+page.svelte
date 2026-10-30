<script lang="ts">
	import { getAbortSignal, untrack } from 'svelte';
	import { createSearchParamsSchema, useSearchParams } from 'runed/kit';
	import Display from '$lib/ui/annotation/Display.svelte';
	import SideBar from '$lib/ui/navigation/SideBar.svelte';
	import Spinner from '$lib/ui/common/Spinner.svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';

	const paramsSchema = createSearchParamsSchema({
		project: { type: 'string' }
	});

	const params = useSearchParams(paramsSchema);

	async function loadProject(project: string | undefined, signal: AbortSignal) {
		if (!project?.startsWith('local_'))
			throw new Error("Can't load: invalid project reference.");
		await projectState.loadLocalProject(Number.parseInt(project.replace('local_', '')), signal);
	}

	// Pending until the effect below starts the first load
	let loading: Promise<void> = $state.raw(new Promise(() => {}));

	$effect(() => {
		const project = params.project;
		const signal = getAbortSignal();
		loading = untrack(() => loadProject(project, signal));
	});
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
