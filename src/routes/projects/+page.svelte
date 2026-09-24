<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { createSearchParamsSchema, useSearchParams } from 'runed/kit';
	import { CloudIcon, HardDriveIcon, UsersIcon } from '@lucide/svelte';
	import {
		deleteProject,
		getProjects,
		getSharedProjects,
		updateProject
	} from '$lib/api/projects';
	import { accountState } from '$lib/states/AccountState.svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import { Button } from '$lib/components/ui/button';
	import Spinner from '$lib/ui/common/Spinner.svelte';
	import ProjectList from '$lib/ui/menus/projects/ProjectList.svelte';
	import ProjectItem from '$lib/ui/menus/projects/ProjectItem.svelte';
	import ProjectView from '$lib/ui/menus/projects/ProjectView.svelte';

	const params = useSearchParams(createSearchParamsSchema({ project: { type: 'string' } }));
</script>

<div class="mx-auto mt-24 flex w-3/5 flex-col gap-10">
	{#if accountState.currentAccount === undefined}
		<Spinner />
	{:else if !accountState.currentAccount}
		<p class="text-muted-foreground text-sm">
			<Button
				variant="link"
				class="px-0"
				href={resolve(
					`/login?redirect=${encodeURIComponent(page.url.pathname + page.url.search)}`
				)}
			>
				Log in
			</Button>
			to manage cloud projects.
		</p>
	{:else if params.project}
		<ProjectView projectId={params.project} />
	{:else}
		<ProjectList title="Your Projects" listProjects={(signal) => getProjects({ signal })}>
			{#snippet item(project, refetch)}
				<!-- TODO: reword to "mark for deletion" when that feature is live -->
				<ProjectItem
					href={resolve(`/projects?project=${project.id}`)}
					icon={CloudIcon}
					{project}
					onRename={(name) => updateProject(project.id, { name }).then(refetch)}
					deleteDescription={`"${project.name}" and all of its versions will be deleted permanently.`}
					onDelete={() => deleteProject(project.id).finally(refetch)}
				>
					{#if project.versions.length}
						Versions: {project.versions.map((v) => v.name).join(', ')}
					{:else}No versions yet{/if}
				</ProjectItem>
			{/snippet}
		</ProjectList>

		<ProjectList
			title="Shared with You"
			listProjects={(signal) => getSharedProjects({ signal })}
			allowCreate={false}
			hideWhenEmpty
		>
			{#snippet item(project)}
				<ProjectItem
					href={resolve(`/projects?project=${project.id}`)}
					icon={UsersIcon}
					{project}
				>
					Shared by {project.owner.name} ({project.owner.email})
					{project.role === 'viewer' ? '(view only)' : ''}
				</ProjectItem>
			{/snippet}
		</ProjectList>
	{/if}

	{#if accountState.currentAccount !== undefined && !params.project}
		<ProjectList
			title="Local Projects"
			listProjects={() => projectState.listLocalProjects()}
			local
			hideWhenEmpty={!!accountState.currentAccount}
		>
			{#snippet item(project, refetch)}
				<ProjectItem
					href={resolve(`/editor?project=local_${project.id}`)}
					icon={HardDriveIcon}
					{project}
					onRename={(name) =>
						projectState.renameLocalProject(project.id!, name).then(refetch)}
					deleteDescription={`"${project.name}" will be removed from this browser.`}
					onDelete={() => projectState.deleteLocalProject(project.id!).finally(refetch)}
				/>
			{/snippet}
		</ProjectList>
	{/if}
</div>
