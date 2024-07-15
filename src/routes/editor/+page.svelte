<script lang="ts">
	import Display from '$lib/UI/Annotation/Display.svelte';
	import TopBar from '$lib/UI/Navigation/TopBar.svelte';
	import SideBar from '$lib/UI/Navigation/SideBar.svelte';
	import Spinner from '$lib/UI/Common/Spinner.svelte';

	import getProject from '$lib/api/projects/getProject';
	import downloadEditorData from '$lib/api/projects/downloadEditorData';
	import downloadSourceData from '$lib/api/projects/downloadSourceData';
	import downloadVersion from '$lib/api/projects/downloadVersion';

	import { annotation, currentProject, currentProjectVersion } from '$lib/stores/data';
	import { decodedTiffIfds } from '$lib/stores/images';
	import { onMount } from 'svelte';
	import { decode } from 'tiff';

	let loading = true;
	let loading_message = 'Loading project...';
	let error_message: string | undefined;

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
			if ($currentProject.status !== 'ready') {
				error_message = 'Error: Project is not ready for annotation';
				loading = false;
				return;
			}

			// Download video data
			loading_message = 'Downloading video...';
			const videoBlob = $currentProject.editor_data
				? await downloadEditorData($currentProject.id)
				: await downloadSourceData($currentProject.id);
			console.log(videoBlob);

			// Decode video
			loading_message = 'Processing video...';
			$decodedTiffIfds = decode(await videoBlob.arrayBuffer());

			// Download annotation
			loading_message = 'Downloading annotation...';
			const annotationBlob = await downloadVersion(
				$currentProject.id,
				$currentProjectVersion
			);

			// Load annotation
			loading_message = 'Processing annotation...';
			const reader = new FileReader();
			reader.onload = () => {
				// This is needed on TXT files
				// textToDataType(reader.result as string).then((d) => {
				// 	$annotation = d;
				// 	loading = false;
				// });

				$annotation = JSON.parse(reader.result as string);
				loading = false;
			};
			reader.readAsText(annotationBlob);
		} catch (error) {
			error_message = String(error);
			loading = false;
			return;
		}
	};

	// display demo data
	// const stored_data = sessionStorage.getItem('demo_data');
	// if (stored_data && stored_data !== 'undefined') {
	// 	data.set(JSON.parse(stored_data));
	// } else {
	// 	onMount(() => {
	// 		document.querySelector('#dataFileInput').addEventListener('change', (e) => {
	// 			const file = (e.currentTarget as HTMLInputElement).files[0];
	// 			if (!file) return;
	// 			const reader = new FileReader();
	// 			reader.onload = () => {
	// 				const text = reader.result as string;
	// 				textToDataType(text).then((d) => {
	// 					data.set(d);
	// 				});
	// 			};
	// 			reader.readAsText(file);
	// 		});
	// 	});
	// }

	// onMount(() => {
	// 	document.querySelector('#tiffFileInput').addEventListener('change', (e) => {
	// 		const file = (e.currentTarget as HTMLInputElement).files[0];
	// 		if (!file) return;
	// 		const reader = new FileReader();
	// 		reader.onload = () => {
	// 			decodedTiffIfds.set(decode(reader.result as ArrayBuffer));
	// 		};
	// 		reader.readAsArrayBuffer(file);
	// 	});
	// });

	onMount(loadProject);
</script>

<!-- {#if !$data}
	<label for="dataFileInput">Load data</label>
	<br />
	<input type="file" id="dataFileInput" accept=".txt" />
	<br />
{/if}

{#if $blob_pngs.length === 0}
	<label for="tiffFileInput">Load tiff</label>
	<br />
	<input type="file" id="tiffFileInput" accept=".tif,.tiff" />
{/if} -->

{#if loading}
	<div class="loading-container">
		<Spinner />
		<p class="message">{loading_message}</p>
	</div>
{:else if error_message}
	<div class="loading-container">
		<p class="error-message">
			{error_message}
		</p>
	</div>
{:else}
	<TopBar />
	<div class="content-wrapper">
		<SideBar />
		<div class="display-wrapper">
			<Display />
		</div>
	</div>
{/if}

<!-- {#if $data && $blob_pngs.length > 0}
	<TopBar />
	<div class="content-wrapper">
		<SideBar />
		<div class="display-wrapper">
			<Display />
		</div>
	</div>
{/if} -->

<style lang="scss">
	.loading-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;

		.message {
			font-size: 18px;
			font-weight: 600;
		}

		.error-message {
			font-size: 16px;
			font-weight: 600;
			color: red;
		}
	}

	.content-wrapper {
		display: flex;
		flex-direction: row;
		align-items: flex-start;
		justify-content: start;
		flex: 1 0 auto;
		width: 100%;
	}

	.display-wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
		flex: 1 0 auto;
		order: 2;
	}
</style>
