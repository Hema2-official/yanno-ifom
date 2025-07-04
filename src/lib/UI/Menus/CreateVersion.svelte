<script lang="ts">
	import Spinner from '../Common/Spinner.svelte';
	import Button from '../Common/Button.svelte';
	import { createProjectVersion } from '$lib/api/projects';
	import { onMount } from 'svelte';
	import { type Project, type ProjectVersion, getNextStep } from '$lib/types/api.type';
	import TextBox from '../Common/TextBox.svelte';

	export let onCreate: () => void;
	export let onCancel: () => void;

	export let project: Project;

	let containerElement: HTMLDivElement;

	let loading = false;
	let error_message: string | undefined;

	let name = '';
	let source_version_id: string | undefined;
	$: sourceVersion = project.versions.find((version) => version.id === source_version_id);

	$: allowSubmit = name.length > 0;

	const handleCancel = () => {
		onCancel();
	};

	const handleCreate = () => {
		loading = true;
		error_message = undefined;

		console.debug('Creating version:', project.id, name, source_version_id);
		createProjectVersion(project.id, name, source_version_id)
			.then((response: ProjectVersion) => {
				console.debug('Created version:', response);
				onCreate();
				onCancel();
			})
			.catch((error: Error) => {
				error_message = error.message;
			})
			.finally(() => {
				loading = false;
			});
	};

	// Default names:
	// segmentation: Segmentation
	// tracking: ... (tracked)
	// inheritance: ... (inheritance predicted)

	onMount(() => {
		// Get focus
		containerElement.querySelector('input')?.focus();
	});
</script>

<div class="create-version-container" bind:this={containerElement}>
	<form class="create-version" class:loading>
		<h3 class="title">New Version</h3>
		<TextBox bind:value={name} disabled={loading}>Name</TextBox>
		<select bind:value={source_version_id}>
			{#each project.versions as version}
				<option value={version.id}>{version.name}</option>
			{/each}
		</select>
		Creating will automatically run {getNextStep(sourceVersion?.step)}
		{#if error_message}<p class="error-message">{error_message}</p>{/if}
		{#if loading}
			<Spinner />
		{:else}
			<div class="buttons">
				<Button type="button" click={handleCancel}>Cancel</Button>
				<Button type="submit" click={handleCreate} disabled={!allowSubmit}>Create</Button>
			</div>
		{/if}
	</form>
</div>

<style lang="scss">
	.create-version-container {
		position: fixed;
		top: 0;
		left: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100vh;
		width: 100%;
		backdrop-filter: blur(2px);
		user-select: none;
	}

	.create-version {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 400px;
		background-color: var(--background-color);
		padding: 16px 24px;
		border-radius: 8px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);

		.title {
			margin: 0;
			font-size: 24px;
			font-weight: 500;
			color: var(--color);
		}

		.buttons {
			width: 100%;
			display: flex;
			align-items: center;
			justify-content: end;
			gap: 8px;
		}

		.error-message {
			margin: 0;
			font-size: 12px;
			color: red;
			padding: 0 4px 4px 4px;
			width: 100%;
		}
	}
</style>
