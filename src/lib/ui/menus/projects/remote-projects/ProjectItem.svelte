<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ProjectStatus, type Project } from '$lib/types/api.type';
	import * as Item from '$lib/components/ui/item';
	import Button from '$lib/components/ui/button/button.svelte';
	import {
		BadgeCheckIcon,
		CircleDashedIcon,
		LoaderCircleIcon,
		PencilIcon,
		TrashIcon,
		UploadIcon
	} from '@lucide/svelte';
	import { cn } from '$lib/utils/shadcn';
	import { deleteProject, uploadSourceData } from '$lib/api/projects';
	import ProjectEditDialog from '../ProjectEditDialog.svelte';
	import { pickFile } from '$lib/utils/filePicker';
	import { toast } from 'svelte-sonner';
	import { getPrimaryFrameCount } from '$lib/utils/frames';

	type Props = { project: Project; onRefresh: () => void };

	let { project = $bindable(), onRefresh }: Props = $props();

	let showEditDialog = $state(false);
	let isUploading = $state(false);

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

	function handleUpload() {
		if (isUploading) return;
		isUploading = true;

		pickFile('.tif,.tiff')
			.then(async (file) => {
				if (!file) return;
				const uploadPromise = uploadSourceData(project.id, file);

				// Report status
				toast.promise(uploadPromise, {
					success: 'Video uploaded successfully',
					loading: 'Uploading video...',
					error: 'Failed to upload video'
				});

				await uploadPromise;
				onRefresh();
			})
			.finally(() => {
				isUploading = false;
			});
	}

	function handleNavigate() {
		goto(resolve(`/projects?project=${project.id}`));
	}
</script>

<Item.Root variant="outline">
	{#snippet child({ props })}
		<Button
			variant="ghost"
			{...props}
			class={cn(String(props.class), 'h-auto')}
			onclick={handleNavigate}
		>
			<Item.Media variant="icon">
				{#if project.status === 'ready'}
					<BadgeCheckIcon />
				{:else if project.status === 'pending'}
					<CircleDashedIcon />
				{/if}
			</Item.Media>

			<Item.Content>
				<Item.Title class="line-clamp-1">
					{project.name}
				</Item.Title>

				{#if project.status === ProjectStatus.ready}
					<Item.Description class="capitalize">
						{project.color.toLowerCase()}, {getPrimaryFrameCount(project)} frames
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

			<Item.Actions onclick={(e) => e.stopPropagation()}>
				{#if project.status === 'pending'}
					<Button
						variant="ghost"
						size="icon-sm"
						onclick={handleUpload}
						disabled={isUploading}
					>
						{#if isUploading}<LoaderCircleIcon class="animate-spin" />
						{:else}<UploadIcon />{/if}
					</Button>
				{:else if project.status === 'ready'}
					<Button variant="ghost" size="icon-sm" onclick={() => (showEditDialog = true)}>
						<PencilIcon />
					</Button>
				{/if}

				<Button
					variant="ghost"
					size="icon-sm"
					class="hover:bg-destructive/40!"
					onclick={handleDelete}
					><TrashIcon />
				</Button>
			</Item.Actions>
		</Button>
	{/snippet}
</Item.Root>

<ProjectEditDialog bind:isOpen={showEditDialog} {project} {onRefresh} />
