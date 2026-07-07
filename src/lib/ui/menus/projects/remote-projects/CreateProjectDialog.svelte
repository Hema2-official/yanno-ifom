<script lang="ts">
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { toast } from 'svelte-sonner';
	import LoaderIcon from '@lucide/svelte/icons/loader';
	import CheckIcon from '@lucide/svelte/icons/check';
	import { resource, watch } from 'runed';
	import { createProject } from '$lib/api/projects';
	import type { Project } from '$lib/types/api.type';
	import { extractError } from '$lib/api/errors';

	type Props = {
		isOpen: boolean;
		onCreated?: (newProject: Project) => void;
	};
	let { isOpen = $bindable(false), onCreated }: Props = $props();

	let name = $state('');

	const createResource = resource(
		[],
		async () => createProject(name) as Promise<Project | undefined>,
		{ lazy: true }
	);

	// Only allow creating if the name is filled in and creation hasn't happened yet
	let allowSubmit = $derived(name.trim() && !createResource.current);

	$effect(() => {
		if (!isOpen) return;
		name = '';
		createResource.mutate(undefined);
	});

	watch([() => createResource.current], ([createdProject]) => {
		if (!createdProject) return;
		toast.success('Project created');
		onCreated?.(createdProject);
		createResource.mutate(undefined);
		isOpen = false;
	});

	watch([() => createResource.error], () => {
		if (!createResource.error) return;
		toast.error("Couldn't create project", { description: extractError(createResource.error) });
	});

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (allowSubmit) createResource.refetch();
	}
</script>

<Dialog.Root bind:open={isOpen}>
	<Dialog.Content>
		<form class="grid gap-4" onsubmit={onSubmit}>
			<Dialog.Header>
				<Dialog.Title>Create project</Dialog.Title>
				<Dialog.Description>
					Create an empty project. You can upload a video for it right after.
				</Dialog.Description>
			</Dialog.Header>

			<div class="flex flex-col gap-3">
				<Label for="title">Name</Label>
				<Input id="title" type="text" bind:value={name} class="flex-1" />
			</div>

			<Dialog.Footer>
				<Dialog.Close class={buttonVariants({ variant: 'secondary' })}>Cancel</Dialog.Close>
				<Button type="submit" disabled={createResource.loading || !allowSubmit}>
					{#if createResource.loading}<LoaderIcon class="size-4 animate-spin" />
					{:else}<CheckIcon class="size-4" />{/if}
					Create
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
