<script lang="ts">
	import type { ProjectVersion } from '$lib/types/api.type';
	import * as Item from '$lib/components/ui/item';
	import { Button } from '$lib/components/ui/button';
	import {
		CircleCheckIcon,
		CopyIcon,
		LoaderCircleIcon,
		PlayIcon,
		SquareIcon,
		TrashIcon
	} from '@lucide/svelte';
	import VersionStatus from './VersionStatus.svelte';
	import ConfirmDialog from '$lib/ui/common/ConfirmDialog.svelte';
	import IconButton from '$lib/ui/common/IconButton.svelte';
	import { cancelTask, deleteVersion } from '$lib/api/projects';
	import { toast } from 'svelte-sonner';
	import { toastError } from '$lib/api/errors';
	import { resolve } from '$app/paths';
	import RunTaskDialog from './RunTaskDialog.svelte';

	type Props = {
		version: ProjectVersion;
		canEdit?: boolean;
		onCopy: () => void;
		onRefresh: () => void;
	};

	let { version, canEdit = true, onCopy, onRefresh }: Props = $props();

	let showRunDialog = $state(false);
	let showDeleteDialog = $state(false);
	let showCancelDialog = $state(false);

	function handleDelete() {
		deleteVersion(version)
			.then(() => {
				toast.success('Version deleted');
				onRefresh();
			})
			.catch((error: unknown) => {
				toastError('Failed to delete version', error);
			});
	}

	function handleCancelTask() {
		cancelTask(version)
			.then(() => {
				toast.success('Task cancelled');
				onRefresh();
			})
			.catch((error: unknown) => {
				toastError('Failed to cancel task', error);
			});
	}

	const getHref = () => resolve(`/editor?project=${version.project_id}&version=${version.id}`);
</script>

<Item.Root variant="outline" class="flex-nowrap">
	{#snippet child({ props })}
		<Button
			{...props}
			class="{props.class} h-auto w-full hover:bg-transparent! {version.ready
				? ''
				: 'cursor-default'}"
			variant="ghost"
			href={version.ready ? getHref() : undefined}
			onclick={!version.ready ? () => toast.warning('This version is not ready.') : undefined}
		>
			<Item.Media variant="icon">
				{#if version.ready}
					<CircleCheckIcon />
				{:else}
					<LoaderCircleIcon class="animate-spin" />
				{/if}
			</Item.Media>

			<Item.Content>
				<Item.Title>{version.name}</Item.Title>
				<Item.Description class="text-wrap">
					<VersionStatus {version} onReady={onRefresh} />
				</Item.Description>
			</Item.Content>

			{#if canEdit}
				<Item.Actions onclick={(e) => [e.preventDefault(), e.stopPropagation()]}>
					{#if version.ready}
						<IconButton
							variant="ghost"
							label="Run a task"
							onclick={() => (showRunDialog = true)}
						>
							<PlayIcon />
						</IconButton>

						<IconButton variant="ghost" label="Copy version" onclick={onCopy}>
							<CopyIcon />
						</IconButton>
					{:else}
						<IconButton
							variant="ghost"
							label="Stop processing"
							onclick={() => (showCancelDialog = true)}
						>
							<SquareIcon />
						</IconButton>
					{/if}

					<IconButton
						variant="ghost"
						class="hover:bg-destructive/40!"
						label="Delete version"
						disabled={!version.ready}
						onclick={() => (showDeleteDialog = true)}
					>
						<TrashIcon />
					</IconButton>
				</Item.Actions>
			{/if}
		</Button>
	{/snippet}
</Item.Root>

<RunTaskDialog bind:isOpen={showRunDialog} {version} {onRefresh} />

<ConfirmDialog
	bind:open={showDeleteDialog}
	title="Delete version?"
	description={`"${version.name}" will be deleted permanently.`}
	confirmLabel="Delete"
	onConfirm={handleDelete}
/>

<ConfirmDialog
	bind:open={showCancelDialog}
	title="Cancel processing?"
	description={`The ongoing processing of "${version.name}" will be stopped.`}
	confirmLabel="Stop processing"
	onConfirm={handleCancelTask}
/>
