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
	import { cancelTask, deleteVersion } from '$lib/api/projects';
	import { toast } from 'svelte-sonner';
	import { extractError } from '$lib/api/errors';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import RunTaskDialog from './RunTaskDialog.svelte';

	type Props = {
		version: ProjectVersion;
		onCopy: () => void;
		onRefresh: () => void;
	};

	let { version, onCopy, onRefresh }: Props = $props();

	let showRunDialog = $state(false);

	function handleDelete() {
		// TODO: use a real dialog
		const choice = confirm(`Delete version "${version.name}"?`);
		if (!choice) return;

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
		// TODO: use a real dialog
		const choice = confirm(`Cancel ongoing processing of "${version.name}"?`);
		if (!choice) return;

		cancelTask(version)
			.then(() => {
				toast.success('Task cancelled');
				onRefresh();
			})
			.catch((error: unknown) => {
				toast.error('Failed to cancel task', { description: extractError(error) });
			});
	}

	function openEditor() {
		if (!version.ready) {
			toast.warning('This version is not ready yet.');
			return;
		}
		goto(resolve(`/editor?project=${version.project_id}&version=${version.id}`));
	}
</script>

<Item.Root variant="outline">
	{#snippet child({ props })}
		<button
			{...props}
			class="{props.class} text-left w-full hover:bg-muted/50 transition-colors"
			class:cursor-pointer={version.ready}
			onclick={version.ready ? openEditor : undefined}
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
				<Item.Description>
					<VersionStatus {version} onReady={onRefresh} />
				</Item.Description>
			</Item.Content>

			<Item.Actions onclick={(e) => e.stopPropagation()}>
				{#if version.ready}
					<Button variant="ghost" size="icon-sm" onclick={() => (showRunDialog = true)}>
						<PlayIcon class="size-4" />
					</Button>

					<Button variant="ghost" size="icon-sm" onclick={onCopy}>
						<CopyIcon class="size-4" />
					</Button>
				{:else}
					<Button variant="ghost" size="icon-sm" onclick={handleCancelTask}>
						<SquareIcon class="size-4" />
					</Button>
				{/if}

				<Button
					variant="ghost"
					size="icon-sm"
					class="hover:bg-destructive/40!"
					onclick={handleDelete}
					><TrashIcon class="size-4" />
				</Button>
			</Item.Actions>
		</button>
	{/snippet}
</Item.Root>

<RunTaskDialog bind:isOpen={showRunDialog} {version} {onRefresh} />
