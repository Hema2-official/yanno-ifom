<script lang="ts">
	import { PencilIcon, TrashIcon, type LucideIcon } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import * as Item from '$lib/components/ui/item';
	import { Button } from '$lib/components/ui/button';
	import ConfirmDialog from '$lib/ui/common/ConfirmDialog.svelte';
	import RenameDialog from './RenameDialog.svelte';
	import { cn } from '$lib/utils/shadcn';
	import { extractError } from '$lib/api/errors';

	type Props = {
		href: string;
		icon: LucideIcon;
		name: string;
		details: string[];
		onRename: (name: string) => Promise<unknown>;
		deleteDescription: string;
		onDelete: () => Promise<unknown>;
	};

	let {
		href,
		icon: Icon,
		name,
		details,
		onRename,
		deleteDescription,
		onDelete
	}: Props = $props();

	let showRenameDialog = $state(false);
	let showDeleteDialog = $state(false);

	const handleDelete = () =>
		onDelete().catch((error: unknown) => {
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
				<Item.Title class="line-clamp-1">{name}</Item.Title>
				{#each details as detail, i (i)}
					<Item.Description>{detail}</Item.Description>
				{/each}
			</Item.Content>

			<Item.Actions onclick={(e) => e.preventDefault()}>
				<Button variant="ghost" size="icon" onclick={() => (showRenameDialog = true)}>
					<PencilIcon />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					class="hover:bg-destructive/40!"
					onclick={() => (showDeleteDialog = true)}
				>
					<TrashIcon />
				</Button>
			</Item.Actions>
		</Button>
	{/snippet}
</Item.Root>

<RenameDialog bind:open={showRenameDialog} {name} rename={onRename} />

<ConfirmDialog
	bind:open={showDeleteDialog}
	title="Delete project?"
	description={deleteDescription}
	confirmLabel="Delete"
	onConfirm={handleDelete}
/>
