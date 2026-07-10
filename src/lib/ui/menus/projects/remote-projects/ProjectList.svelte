<script lang="ts">
	import { resource } from 'runed';
	import { getProjects } from '$lib/api/projects';
	import { accountState } from '$lib/states/AccountState.svelte';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import ProjectItem from './ProjectItem.svelte';
	import CreateProjectDialog from './CreateProjectDialog.svelte';
	import Spinner from '$lib/UI/common/Spinner.svelte';
	import ProjectListHeader from '../ProjectListHeader.svelte';

	const projectsResource = resource(
		() => accountState.currentAccount,
		async (currentAccount, _, { signal }) => {
			if (!currentAccount) return [];
			return getProjects({ signal });
		},
		{ initialValue: [] }
	);

	// Sort projects by status: not ready first, then ready
	let projects = $derived(
		projectsResource.current.toSorted(
			(a, b) => (a.video_config ? 1 : 0) - (b.video_config ? 1 : 0)
		)
	);

	let showCreateDialog = $state(false);
</script>

<div class="flex w-full flex-col items-center gap-y-4">
	<ProjectListHeader
		isRefreshing={projectsResource.loading}
		onRefresh={() => projectsResource.refetch()}
		onNew={() => (showCreateDialog = true)}
	/>

	{#if projectsResource.loading}
		<Spinner />
	{:else}
		<ScrollArea class="w-full">
			<div class="flex flex-col gap-3">
				{#each projects as project (project.id)}
					<ProjectItem {project} onRefresh={() => projectsResource.refetch()} />
				{/each}
			</div>
		</ScrollArea>
	{/if}
</div>

<CreateProjectDialog bind:isOpen={showCreateDialog} onCreated={() => projectsResource.refetch()} />
