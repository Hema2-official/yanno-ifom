<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Project } from '$lib/types/api.type';
	import * as Item from '$lib/components/ui/item';
	import Button from '$lib/components/ui/button/button.svelte';
	import {
		BadgeCheckIcon,
		CircleDashedIcon,
		PencilIcon,
		TrashIcon,
		UploadIcon
	} from '@lucide/svelte';
	import { cn } from '$lib/utils/shadcn';
	import { deleteProject } from '$lib/api/projects';
	import ProjectEditDialog from './ProjectEditDialog.svelte';
	import UploadVideoDialog from './UploadVideoDialog.svelte';
	import { toast } from 'svelte-sonner';
	import { getFrameCount } from '$lib/utils/frames';

	type Props = { project: Project; onRefresh: () => void };

	let { project = $bindable(), onRefresh }: Props = $props();

	let showEditDialog = $state(false);
	let showUploadDialog = $state(false);

	function handleDelete() {
		// TODO: use a real dialog
		const choice = confirm(`Are you sure you want to delete project "${project.name}"?`);
		if (!choice) return;

		deleteProject(project.id)
			.catch((error: unknown) => {
				toast.error('Failed to delete project', { description: String(error) });
			})
			.finally(() => onRefresh());
	}
</script>

<Item.Root variant="outline">
	{#snippet child({ props })}
		<Button
			variant="ghost"
			{...props}
			class={cn(String(props.class), 'h-auto hover:bg-transparent!')}
			href={resolve(`/projects?project=${project.id}`)}
		>
			<Item.Media variant="icon">
				{#if project.video_config}
					<BadgeCheckIcon />
				{:else}
					<CircleDashedIcon />
				{/if}
			</Item.Media>

			<Item.Content>
				<Item.Title class="line-clamp-1">
					{project.name}
				</Item.Title>

				{#if project.video_config}
					<Item.Description class="capitalize">
						{project.video_config.color.toLowerCase()}, {getFrameCount(
							project.video_config,
							project.video_metadata
						)} frames
					</Item.Description>
				{:else}
					<Item.Description>Upload a video to get started</Item.Description>
				{/if}

				{#if project.versions.length > 0}
					<Item.Description>
						Versions: {project.versions.map((v) => v.name).join(', ')}
					</Item.Description>
				{/if}
			</Item.Content>

			<Item.Actions onclick={(e) => e.preventDefault()}>
				{#if project.video_config}
					<Button variant="ghost" size="icon" onclick={() => (showEditDialog = true)}>
						<PencilIcon />
					</Button>
				{:else}
					<Button variant="ghost" size="icon" onclick={() => (showUploadDialog = true)}>
						<UploadIcon />
					</Button>
				{/if}

				<Button
					variant="ghost"
					size="icon"
					class="hover:bg-destructive/40!"
					onclick={handleDelete}
					><TrashIcon />
				</Button>
			</Item.Actions>
		</Button>
	{/snippet}
</Item.Root>

<ProjectEditDialog bind:isOpen={showEditDialog} {project} {onRefresh} />

<UploadVideoDialog bind:isOpen={showUploadDialog} {project} {onRefresh} />
