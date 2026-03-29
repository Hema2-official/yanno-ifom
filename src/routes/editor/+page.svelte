<script lang="ts">
	import Display from '$lib/UI/Annotation/Display.svelte';
	import TopBar from '$lib/UI/Navigation/TopBar.svelte';
	import SideBar from '$lib/UI/Navigation/SideBar.svelte';
	import Spinner from '$lib/UI/Common/Spinner.svelte';

	import getProject from '$lib/api/projects/getProject';
	import { downloadEditorData, downloadSourceData, getVersionData } from '$lib/api/projects';

	import { annotation, currentProject, currentProjectVersion } from '$lib/stores/data';
	import { decodedTiffIfds } from '$lib/stores/images';
	import { onMount } from 'svelte';
	import { decode } from 'tiff';

	let loading = $state(true);
	let loading_message = $state('Loading project...');
	let error_message: string | undefined = $state(undefined);

	const loadProject = async () => {
		// Get project id and version from query params
		const urlParams = new URLSearchParams(window.location.search);
		const projectId = urlParams.get('project');
		const version = urlParams.get('version');

		try {
			// Check values
			if (!projectId || isNaN(parseInt(projectId))) throw new Error('Invalid project ID');
			if (!version) throw new Error('Invalid version');

			// Fetch project
			$currentProject = await getProject(parseInt(projectId));
			$currentProjectVersion = version;

			// Check project status
			if (!$currentProjectVersion.ready) {
				throw 'Error: This version is not ready for annotation';
			}

			// Download video data
			loading_message = 'Downloading video...';
			const videoBlob = $currentProject.editor_data
				? await downloadEditorData($currentProject.id)
				: await downloadSourceData($currentProject.id);
			console.debug('videoBlob', videoBlob);

			// Decode video
			loading_message = 'Processing video...';
			$decodedTiffIfds = decode(await videoBlob.arrayBuffer());

			// Download annotation
			loading_message = 'Downloading annotation...';

			// TODO: fix
			// $annotation = await getVersionData($currentProject.id, $currentProjectVersion);
			loading = false;

			// This is needed on TXT files
			// textToDataType(reader.result as string).then((d) => {
			// 	$annotation = d;
			// 	loading = false;
			// });
		} catch (error) {
			error_message = String(error);
			loading = false;
			return;
		}
	};

	onMount(loadProject);
</script>

{#if loading}
	<div class="flex flex-col items-center justify-center h-full">
		<Spinner />
		<p class="text-lg font-semibold">{loading_message}</p>
	</div>
{:else if error_message}
	<div class="flex flex-col items-center justify-center h-full">
		<p class="text-base font-semibold text-red-500">
			{error_message}
		</p>
	</div>
{:else}
	<TopBar />
	<div class="flex flex-row items-start justify-start flex-1 w-full">
		<SideBar />
		<div class="flex flex-col items-center h-full flex-1 order-2">
			<Display />
		</div>
	</div>
{/if}

<!-- {#if $data && $blob_pngs.length > 0}
	<TopBar />
	<div class="flex flex-row items-start justify-start flex-1 w-full">
		<SideBar />
		<div class="flex flex-col items-center h-full flex-1 order-2">
			<Display />
		</div>
	</div>
{/if} -->
