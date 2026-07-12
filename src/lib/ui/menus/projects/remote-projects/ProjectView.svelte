<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getProject } from '$lib/api/projects';
	import { versionStepOrder, type ProjectVersion } from '$lib/types/api.type';
	import { resource } from 'runed';
	import { getFrameCount } from '$lib/utils/frames';

	import { Button } from '$lib/components/ui/button';
	import Spinner from '$lib/UI/common/Spinner.svelte';
	import VersionItem from '../../version/VersionItem.svelte';
	import ProjectEditDialog from './ProjectEditDialog.svelte';
	import CreateVersionDialog from '../../version/CreateVersionDialog.svelte';

	import {
		ArrowLeftIcon,
		PencilIcon,
		PlusIcon,
		LayersIcon,
		CircleDashedIcon,
		type LucideIcon,
		SparklesIcon
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

{#snippet VersionGroup(label: string, versions: ProjectVersion[], Icon: LucideIcon)}
	{#if versions.length > 0}
		<div class="flex flex-col gap-2">
			<h3 class="flex items-center gap-2 text-lg font-semibold capitalize">
				<Icon class="text-muted-foreground size-4" />
				{label}
				<span class="text-muted-foreground text-sm font-normal">
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
{/snippet}

<div class="flex w-full flex-col gap-6">
	{#if projectResource.loading}
		<div class="flex w-full items-center justify-center"><Spinner /></div>
	{:else if project}
		<!-- Header -->
		<div class="flex items-center gap-3">
			<div class="flex w-full items-center justify-between">
				<div class="flex items-baseline gap-2">
					<Button variant="ghost" size="icon" onclick={() => goto(resolve('/projects'))}>
						<ArrowLeftIcon />
					</Button>
					<h2 class="text-2xl font-bold">{project.name}</h2>
				</div>

				<div class="flex gap-2">
					<Button variant="secondary" onclick={() => (showEditDialog = true)}>
						<PencilIcon data-icon="inline-start" /> Edit
					</Button>
					<Button onclick={handleCreateVersion}>
						<PlusIcon data-icon="inline-start" /> New Version
					</Button>
				</div>
			</div>
		</div>

		{#if project.video_config}
			<p class="text-muted-foreground -mt-2 text-sm">
				{getFrameCount(project.video_config, project.video_metadata)} primary frames · {project
					.video_metadata?.frame_count ?? 0}
				total frames
			</p>

			<!-- Newly created versions -->
			{@render VersionGroup(
				'newly created',
				project.versions.filter((v) => v.step === null),
				SparklesIcon
			)}

			<!-- Versions by step -->
			{#each versionStepOrder as step (step)}
				{@const versions = project.versions.filter((v) => v.step === step)}
				{@render VersionGroup(step, versions, LayersIcon)}
			{/each}

			{#if project.versions.length === 0}
				<div class="text-muted-foreground flex flex-col items-center gap-2 py-12">
					<LayersIcon class="size-8" />
					<p class="text-sm">No versions yet. Create one to get started.</p>
				</div>
			{/if}
		{:else}
			<div
				class="text-muted-foreground flex flex-col items-center justify-center gap-2 py-12"
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
