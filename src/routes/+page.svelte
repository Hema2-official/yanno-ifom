<script lang="ts">
	import type { Project } from '$lib/types/api.type';
	import ProjectList from '$lib/UI/Menus/ProjectList.svelte';
	import { goto } from '$app/navigation';

	// handle project selection
	const handleSelect = (project: Project) => {
		console.log('Selected project:', project);

		// Check if the project is ready
		if (project.status !== 'ready') {
			alert('Project is not ready yet');
			return;
		}

		// Go to editor page referencing the selected project
		goto(`/editor?project=${project.id}&version=edit1`);
	};
</script>

<div class="project-selector">
	<ProjectList onSelect={handleSelect} />
</div>

<style lang="scss">
	// center the project list and make it 500px wide
	.project-selector {
		display: flex;
		justify-content: center;
		width: 500px;
		margin: 100px auto;
	}
</style>
