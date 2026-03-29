<script lang="ts">
	import Button from '$lib/UI/Common/Button.svelte';
	import CheckBox from '$lib/UI/Common/CheckBox.svelte';
	import Spinner from '$lib/UI/Common/Spinner.svelte';
	import TextBox from '$lib/UI/Common/TextBox.svelte';
	import { onMount } from 'svelte';
	import { VideoColor, type Project } from '$lib/types/api.type';
	import { updateProject } from '$lib/api/projects';

	let {
		onEdit,
		onCancel,
		project
	}: { onEdit: () => void; onCancel: () => void; project: Project } = $props();

	let containerElement: HTMLDivElement;

	let loading = $state(false);
	let error_message: string | undefined = $state(undefined);

	// $: allowSubmit = name.length > 0;

	const handleCancel = () => {
		onCancel();
	};

	const handleEdit = () => {
		loading = true;
		error_message = undefined;
		updateProject(project.id, {
			name: project.name,
			color: project.color,
			channel_period: project.channel_period,
			start_period: project.start_period
		})
			.then(() => {
				onEdit();
				onCancel();
			})
			.catch((error) => {
				error_message = error.message;
			})
			.finally(() => {
				loading = false;
			});
	};

	let isGrayscale = $state(project.color === VideoColor.GRAYSCALE);

	$effect(() => {
		project.color = isGrayscale ? VideoColor.GRAYSCALE : VideoColor.RGB;
	});

	let channel_period = $state(String(project.channel_period));

	$effect(() => {
		project.channel_period = Number(channel_period);
	});

	let start_period = $state(String(project.start_period));

	$effect(() => {
		project.start_period = Number(start_period);
	});

	onMount(() => {
		// Get focus
		containerElement.querySelector('input')?.focus();
	});
</script>

<div class="edit-project-container" bind:this={containerElement}>
	<form class="edit-project" class:loading>
		<h3 class="title">Edit Project</h3>
		<TextBox bind:value={project.name} disabled={loading}>Name</TextBox>
		<TextBox bind:value={channel_period} disabled={loading}>Channel period</TextBox>
		<TextBox bind:value={start_period} disabled={loading}>Start period</TextBox>
		<CheckBox bind:checked={isGrayscale} disabled={loading}>Grayscale</CheckBox>

		{#if error_message}<p class="error-message">{error_message}</p>{/if}
		{#if loading}
			<Spinner />
		{:else}
			<div class="buttons">
				<Button type="button" click={handleCancel}>Cancel</Button>
				<Button type="submit" click={handleEdit}>Save</Button>
			</div>
		{/if}
	</form>
</div>

<style lang="scss">
	.edit-project-container {
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

	.edit-project {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 300px;
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
