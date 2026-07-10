<script lang="ts">
	import type { Project } from '$lib/types/api.type';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { resource, watch } from 'runed';
	import { updateProject } from '$lib/api/projects';
	import { toast } from 'svelte-sonner';
	import { CloudAlertIcon, LoaderCircleIcon } from '@lucide/svelte';
	import { deepCopy } from '$lib/utils/data.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { toState } from '$lib/utils/runes.svelte';

	type Props = {
		project: Project;
		isOpen: boolean;
		onRefresh?: () => void;
	};
	let { project, isOpen = $bindable(false), onRefresh }: Props = $props();

	// Have a reactive local copy of the project for editing
	let localProject: Project = $derived(toState(deepCopy(project)));
	let allowSubmit = $derived(localProject.name.trim().length > 0);

	const updateResource = resource(
		[],
		async () => {
			return updateProject(project.id, {
				name: localProject.name.trim()
			});
		},
		{ lazy: true }
	);

	watch([() => updateResource.current], ([value]) => {
		if (!value) return;
		onRefresh?.();
		isOpen = false;
	});

	watch([() => updateResource.error], ([error]) => {
		if (error) toast.error('Failed to update project', { description: error.message });
	});

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (allowSubmit) updateResource.refetch();
	}
</script>

<Dialog.Root bind:open={isOpen}>
	<Dialog.Content>
		<form class="grid gap-4" onsubmit={onSubmit}>
			<Dialog.Header>
				<Dialog.Title class="flex items-center gap-2">
					Edit Project
					{#if updateResource.error}
						<CloudAlertIcon class="text-destructive size-4" />
					{/if}
				</Dialog.Title>
			</Dialog.Header>

			<div class="grid gap-4">
				<div class="grid gap-2">
					<Label for="project-name">Name</Label>
					<Input
						id="project-name"
						bind:value={localProject.name}
						placeholder="Project name"
					/>
				</div>
			</div>

			<Dialog.Footer>
				<Dialog.Close class={buttonVariants({ variant: 'secondary' })}>Cancel</Dialog.Close>
				<Button type="submit" disabled={updateResource.loading || !allowSubmit}>
					{#if updateResource.loading}
						<LoaderCircleIcon data-icon="inline-start" class="animate-spin" />
					{/if}
					Save
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
