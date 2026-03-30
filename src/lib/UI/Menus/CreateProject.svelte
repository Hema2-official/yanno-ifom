<script lang="ts">
	import TextBox from '../Common/TextBox.svelte';
	import Spinner from '../Common/Spinner.svelte';
	import { Button } from '$lib/components/ui/button';
	import createProject from '$lib/api/projects/createProject';
	import { onMount } from 'svelte';

	let { onCreate, onCancel }: { onCreate: () => void; onCancel: () => void } = $props();

	let containerElement: HTMLDivElement;

	let loading = $state(false);
	let name = $state('');
	let error_message: string | undefined = $state(undefined);

	let allowSubmit = $derived(name.length > 0);

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

<div
	class="fixed top-0 left-0 flex justify-center items-center h-screen w-full backdrop-blur-sm select-none"
	bind:this={containerElement}
>
	<form
		class="flex flex-col items-center w-[300px] bg-[var(--background-color)] px-6 py-4 rounded-lg shadow-md"
		class:loading
	>
		<h3 class="m-0 text-2xl font-medium text-[var(--color)]">Create Project</h3>
		<TextBox bind:value={name} disabled={loading}>Name</TextBox>
		{#if error_message}<p class="m-0 text-xs text-red-500 px-1 pb-1 w-full">
				{error_message}
			</p>{/if}
		{#if loading}
			<Spinner />
		{:else}
			<div class="w-full flex items-center justify-end gap-2">
				<Button variant="secondary" type="button" onclick={handleCancel}>Cancel</Button>
				<Button type="submit" onclick={handleCreate} disabled={!allowSubmit}>Create</Button>
			</div>
		{/if}
	</form>
</div>
