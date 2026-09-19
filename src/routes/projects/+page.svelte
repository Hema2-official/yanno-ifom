<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { createSearchParamsSchema, useSearchParams } from 'runed/kit';
	import { CloudIcon, HardDriveIcon } from '@lucide/svelte';
	import { deleteProject, getProjects, updateProject } from '$lib/api/projects';
	import { accountState } from '$lib/states/AccountState.svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import { videoSummary } from '$lib/utils/frames';
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
					name={project.name}
					details={[
						videoSummary(project.video_config, project.video_metadata),
						project.versions.length
							? `Versions: ${project.versions.map((v) => v.name).join(', ')}`
							: 'No versions yet'
					]}
					onRename={(name) => updateProject(project.id, { name }).then(refetch)}
					deleteDescription={`"${project.name}" and all of its versions will be deleted permanently.`}
					onDelete={() => deleteProject(project.id).finally(refetch)}
				/>
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
					name={project.name}
					details={[videoSummary(project.video_config, project.video_metadata)]}
					onRename={(name) =>
						projectState.renameLocalProject(project.id!, name).then(refetch)}
					deleteDescription={`"${project.name}" will be removed from this browser.`}
					onDelete={() => projectState.deleteLocalProject(project.id!).finally(refetch)}
				/>
			{/snippet}
		</ProjectList>
	{/if}
</div>
