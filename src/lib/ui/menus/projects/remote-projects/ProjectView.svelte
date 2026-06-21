<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getProject } from '$lib/api/projects';
	import { ProjectStatus, versionStepOrder, type ProjectVersion } from '$lib/types/api.type';
	import { resource } from 'runed';
	import { getPrimaryFrameCount } from '$lib/utils/frames';

	import { Button } from '$lib/components/ui/button';
	import Spinner from '../../../common/Spinner.svelte';
	import VersionItem from '../../version/VersionItem.svelte';
	import ProjectEditDialog from './ProjectEditDialog.svelte';
	import CreateVersionDialog from '../../version/CreateVersionDialog.svelte';

	import {
		ArrowLeftIcon,
		PencilIcon,
		PlusIcon,
		LayersIcon,
		CircleDashedIcon
	} from '@lucide/svelte';

	type Props = { projectId: string };
	let { projectId }: Props = $props();

	const projectResource = resource(
		() => projectId,
		async (id, _, { signal }) => getProject(id, { signal })
	);

	let project = $derived(projectResource.current);

	let showEditDialog = $state(false);
	let showCreateVersionDialog = $state(false);
	let copyFromVersion: ProjectVersion | undefined = $state(undefined);

	function handleCopyVersion(v: ProjectVersion) {
		copyFromVersion = v;
		showCreateVersionDialog = true;
	}

	function handleCreateVersion() {
		copyFromVersion = undefined;
		showCreateVersionDialog = true;
	}
</script>

<div class="flex flex-col gap-6 w-full">
	{#if projectResource.loading}
		<div class="flex justify-center items-center w-full"><Spinner /></div>
	{:else if project}
		<!-- Header -->
		<div class="flex items-center gap-3">
			<div class="flex items-center justify-between w-full">
				<div class="flex items-baseline gap-3">
					<Button
						variant="ghost"
						size="icon-sm"
						onclick={() => goto(resolve('/projects'))}
					>
						<ArrowLeftIcon class="size-4" />
					</Button>
					<h2 class="text-2xl font-bold">{project.name}</h2>
				</div>

				<div class="flex gap-2">
					<Button variant="outline" size="sm" onclick={() => (showEditDialog = true)}>
						<PencilIcon class="size-3.5" /> Edit
					</Button>
					<Button size="sm" onclick={handleCreateVersion}>
						<PlusIcon class="size-3.5" /> New Version
					</Button>
				</div>
			</div>
		</div>

		{#if project.status === ProjectStatus.ready}
			<p class="text-sm text-muted-foreground -mt-2">
				{getPrimaryFrameCount(project)} primary frames · {project.frame_count}
				total frames
			</p>

			<!-- Versions by step -->
			{#each versionStepOrder as step (step)}
				{@const versions = project.versions.filter((v) => v.step === step)}

				{#if versions.length > 0}
					<div class="flex flex-col gap-2">
						<h3 class="text-lg font-semibold capitalize flex items-center gap-2">
							<LayersIcon class="size-4 text-muted-foreground" />
							{step}
							<span class="text-sm font-normal text-muted-foreground">
								({versions.length})
							</span>
						</h3>

						<div class="flex flex-col gap-2">
							{#each versions as version (version.id)}
								<VersionItem
									{version}
									onCopy={() => handleCopyVersion(version)}
									onRefresh={() => projectResource.refetch()}
								/>
							{/each}
						</div>
					</div>
				{/if}
			{/each}

			{#if project.versions.length === 0}
				<div class="flex flex-col items-center py-12 text-muted-foreground gap-2">
					<LayersIcon class="size-8" />
					<p class="text-sm">No versions yet. Create one to get started.</p>
				</div>
			{/if}
		{:else}
			<div
				class="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2"
			>
				<CircleDashedIcon class="size-8" />
				<p class="text-sm">This project is not ready yet. Upload source data first.</p>
			</div>
		{/if}
	{/if}
</div>

{#if project}
	<ProjectEditDialog
		bind:isOpen={showEditDialog}
		{project}
		onRefresh={() => projectResource.refetch()}
	/>

	<CreateVersionDialog
		bind:isOpen={showCreateVersionDialog}
		{project}
		{copyFromVersion}
		onRefresh={() => projectResource.refetch()}
	/>
{/if}
