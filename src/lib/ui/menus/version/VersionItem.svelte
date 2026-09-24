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
	import { cancelTask, deleteVersion } from '$lib/api/projects';
	import { toast } from 'svelte-sonner';
	import { extractError } from '$lib/api/errors';
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
				toast.error('Failed to delete version', { description: extractError(error) });
			});
	}

	function handleCancelTask() {
		cancelTask(version)
			.then(() => {
				toast.success('Task cancelled');
				onRefresh();
			})
			.catch((error: unknown) => {
				toast.error('Failed to cancel task', { description: extractError(error) });
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
						<Button variant="ghost" size="icon" onclick={() => (showRunDialog = true)}>
							<PlayIcon />
						</Button>

						<Button variant="ghost" size="icon" onclick={onCopy}>
							<CopyIcon />
						</Button>
					{:else}
						<Button
							variant="ghost"
							size="icon"
							onclick={() => (showCancelDialog = true)}
						>
							<SquareIcon />
						</Button>
					{/if}

					<Button
						variant="ghost"
						size="icon"
						class="hover:bg-destructive/40!"
						disabled={!version.ready}
						onclick={() => (showDeleteDialog = true)}
						><TrashIcon />
					</Button>
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
