<script lang="ts" generics="T extends { id?: string | number }">
	import type { Snippet } from 'svelte';
	import { resource } from 'runed';
	import { PlusIcon, RefreshCwIcon } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import Spinner from '$lib/ui/common/Spinner.svelte';
	import CreateProjectDialog from './CreateProjectDialog.svelte';

	type Props = {
		title: string;
		listProjects: (signal: AbortSignal) => Promise<T[]>;
		item: Snippet<[project: T, refetch: () => void]>;
		/** Projects stored in this browser instead of the cloud. */
		local?: boolean;
		/** Leave out the whole section while there is nothing to list. */
		hideWhenEmpty?: boolean;
	};

	let { title, listProjects, item, local = false, hideWhenEmpty = false }: Props = $props();

	const projects = resource([], (_, __, { signal }) => listProjects(signal), {
		initialValue: []
	});
	const refetch = () => void projects.refetch();

	let showCreate = $state(false);
</script>

{#if !hideWhenEmpty || projects.current.length > 0}
	<div class="flex w-full flex-col items-center gap-y-4">
		<div class="flex w-full items-center justify-between">
			<h2 class="cursor-default text-3xl font-bold">{title}</h2>

			<div class="flex gap-2">
				<Button variant="secondary" onclick={refetch} disabled={projects.loading}>
					<RefreshCwIcon data-icon="inline-start" /> Refresh
				</Button>
				<Button onclick={() => (showCreate = true)}>
					<PlusIcon data-icon="inline-start" /> New
				</Button>
			</div>
		</div>

		{#if projects.loading}
			<Spinner />
		{:else if projects.error}
			<p class="text-destructive text-sm">{projects.error.message}</p>
		{:else if projects.current.length === 0}
			<p class="text-muted-foreground text-sm">No projects yet.</p>
		{:else}
			<ScrollArea class="w-full">
				<div class="flex flex-col gap-3">
					{#each projects.current as project (project.id)}
						{@render item(project, refetch)}
					{/each}
				</div>
			</ScrollArea>
		{/if}
	</div>
{/if}

<CreateProjectDialog bind:open={showCreate} {local} onCreated={refetch} />
