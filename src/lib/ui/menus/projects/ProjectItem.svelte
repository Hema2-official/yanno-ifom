<script lang="ts">
	import type { Snippet } from 'svelte';
	import { PencilIcon, TrashIcon, type LucideIcon } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import * as Item from '$lib/components/ui/item';
	import { Button } from '$lib/components/ui/button';
	import ConfirmDialog from '$lib/ui/common/ConfirmDialog.svelte';
	import RenameDialog from './RenameDialog.svelte';
	import { cn } from '$lib/utils/shadcn';
	import { videoSummary } from '$lib/utils/frames';
	import { extractError } from '$lib/api/errors';
	import type { Project } from '$lib/types/api.type';
	import type { DBProject } from '$lib/utils/indexeddb';

	type Props = {
		href: string;
		icon: LucideIcon;
		project: Project | DBProject;
		children?: Snippet;
		onRename?: (name: string) => Promise<unknown>;
		deleteDescription?: string;
		onDelete?: () => Promise<unknown>;
	};

	let {
		href,
		icon: Icon,
		project,
		children,
		onRename,
		deleteDescription,
		onDelete
	}: Props = $props();

	let showRenameDialog = $state(false);
	let showDeleteDialog = $state(false);

	const handleDelete = () =>
		onDelete?.().catch((error: unknown) => {
			toast.error('Failed to delete project', { description: extractError(error) });
		});
</script>

<Item.Root variant="outline">
	{#snippet child({ props })}
		<Button
			variant="ghost"
			{...props}
			class={cn(String(props.class), 'h-auto hover:bg-transparent!')}
			{href}
		>
			<Item.Media variant="icon"><Icon /></Item.Media>

			<Item.Content>
				<Item.Title class="line-clamp-1">{project.name}</Item.Title>
				<Item.Description>
					{videoSummary(project.video_config, project.video_metadata)}
				</Item.Description>
				{#if children}
					<Item.Description>{@render children()}</Item.Description>
				{/if}
			</Item.Content>

			{#if onRename || onDelete}
				<Item.Actions onclick={(e) => e.preventDefault()}>
					{#if onRename}
						<Button
							variant="ghost"
							size="icon"
							onclick={() => (showRenameDialog = true)}
						>
							<PencilIcon />
						</Button>
					{/if}
					{#if onDelete}
						<Button
							variant="ghost"
							size="icon"
							class="hover:bg-destructive/40!"
							onclick={() => (showDeleteDialog = true)}
						>
							<TrashIcon />
						</Button>
					{/if}
				</Item.Actions>
			{/if}
		</Button>
	{/snippet}
</Item.Root>

{#if onRename}
	<RenameDialog bind:open={showRenameDialog} name={project.name} rename={onRename} />
{/if}

{#if onDelete}
	<ConfirmDialog
		bind:open={showDeleteDialog}
		title="Delete project?"
		description={deleteDescription}
		confirmLabel="Delete"
		onConfirm={handleDelete}
	/>
{/if}
