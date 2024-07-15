<script lang="ts">
	import TextBox from '../Common/TextBox.svelte';
	import Spinner from '../Common/Spinner.svelte';
	import Button from '../Common/Button.svelte';
	import createProject from '$lib/api/projects/createProject';
	import { onMount } from 'svelte';

	export let onCreate: () => void;
	export let onCancel: () => void;

	let containerElement: HTMLDivElement;

	let loading = false;
	let name = '';
	let error_message: string | undefined;

	$: allowSubmit = name.length > 0;

	const handleCancel = () => {
		onCancel();
	};

	const handleCreate = () => {
		loading = true;
		error_message = undefined;
		createProject(name)
			.then((response) => {
				console.log('Created project:', response);
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

	onMount(() => {
		// Get focus
		containerElement.querySelector('input')?.focus();
	});
</script>

<div class="create-project-container" bind:this={containerElement}>
	<form class="create-project" class:loading>
		<h3 class="title">Create Project</h3>
		<TextBox bind:value={name} disabled={loading}>Name</TextBox>
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
	.create-project-container {
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

	.create-project {
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
