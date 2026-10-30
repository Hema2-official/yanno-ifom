<script lang="ts">
	import { resolve } from '$app/paths';
	import { HardDriveIcon } from '@lucide/svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import ProjectList from '$lib/ui/menus/projects/ProjectList.svelte';
	import ProjectItem from '$lib/ui/menus/projects/ProjectItem.svelte';
</script>

<div class="mx-auto mt-24 flex w-3/5 flex-col gap-10">
	<ProjectList title="Local Projects" listProjects={() => projectState.listLocalProjects()}>
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
</div>
