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

			<Item.Actions onclick={(e) => e.preventDefault()}>
				{#if version.ready}
					<Button variant="ghost" size="icon" onclick={() => (showRunDialog = true)}>
						<PlayIcon />
					</Button>

					<Button variant="ghost" size="icon" onclick={onCopy}>
						<CopyIcon />
					</Button>
				{:else}
					<Button variant="ghost" size="icon" onclick={handleCancelTask}>
						<SquareIcon />
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

<RunTaskDialog bind:isOpen={showRunDialog} {version} {onRefresh} />
