<script lang="ts">
	import { VideoColor, type Project } from '$lib/types/api.type';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import { Separator } from '$lib/components/ui/separator';
	import PeriodChanger from '../../PeriodChanger.svelte';
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
				name: localProject.name.trim(),
				color: localProject.color,
				start_period: localProject.start_period,
				channel_period: localProject.channel_period
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
</script>

<Dialog.Root bind:open={isOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				Edit Project
				{#if updateResource.error}<CloudAlertIcon class="size-4 text-destructive" />{/if}
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

			<Label for="project-grayscale" class="cursor-pointer">
				<Checkbox
					id="project-grayscale"
					checked={localProject.color === VideoColor.GRAYSCALE}
					onCheckedChange={(checked) =>
						(localProject.color = checked ? VideoColor.GRAYSCALE : VideoColor.RGB)}
				/>
				Grayscale
			</Label>

			<Separator />

			<PeriodChanger bind:project={localProject} />
		</div>

		<Dialog.Footer>
			<Dialog.Close class={buttonVariants({ variant: 'secondary' })}>Cancel</Dialog.Close>
			<Button
				type="submit"
				onclick={() => updateResource.refetch()}
				disabled={updateResource.loading || !allowSubmit}
			>
				{#if updateResource.loading}<LoaderCircleIcon class="size-4 animate-spin" />{/if}
				Save
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
