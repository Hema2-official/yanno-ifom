<script lang="ts">
	import { resource } from 'runed';
	import { getProjects } from '$lib/api/projects';
	import { accountState } from '$lib/states/AccountState.svelte';
	import { ProjectStatus } from '$lib/types/api.type';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import ProjectItem from './ProjectItem.svelte';
	import CreateProjectDialog from './CreateProjectDialog.svelte';
	import Spinner from '../Common/Spinner.svelte';
	import { Button } from '$lib/components/ui/button';
	import { PlusIcon, RefreshCwIcon } from '@lucide/svelte';

	const projectsResource = resource(
		() => accountState.currentAccount,
		async (currentAccount, _, { signal }) => {
			if (!currentAccount) return [];
			return getProjects({ signal });
		},
		{ initialValue: [] }
	);

	// Sort projects by status:
	const order = [ProjectStatus.uploading, ProjectStatus.pending, ProjectStatus.ready];
	let projects = $derived(
		projectsResource.current.toSorted((a, b) => {
			return order.indexOf(a.status) - order.indexOf(b.status);
		})
	);

	let showCreateDialog = $state(false);
</script>

<div class="flex flex-col items-center gap-y-4 w-full">
	<div class="flex items-center justify-between w-full">
		<h2 class="text-3xl font-bold">Projects</h2>

		<div class="flex gap-2">
			<Button
				variant="outline"
				onclick={() => projectsResource.refetch()}
				disabled={projectsResource.loading}
			>
				<RefreshCwIcon class="size-4" />
				Refresh
			</Button>
			<Button variant="default" onclick={() => (showCreateDialog = true)}>
				<PlusIcon class="size-4" />
				New
			</Button>
		</div>
	</div>

	{#if projectsResource.loading}
		<Spinner />
	{:else}
		<ScrollArea class="w-full">
			<div class="flex flex-col gap-3">
				{#each projects as project (project.id)}
					<ProjectItem
						{project}
						onRefresh={() => projectsResource.refetch()}
					/>
				{/each}
			</div>
		</ScrollArea>
	{/if}
</div>

<CreateProjectDialog bind:isOpen={showCreateDialog} onCreated={() => projectsResource.refetch()} />
