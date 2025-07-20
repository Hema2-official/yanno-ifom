<script lang="ts">
	import type { ProjectVersion } from '$lib/types/api.type';
	import ProjectList from '$lib/UI/Menus/ProjectList.svelte';

	// handle project selection
	const handleSelect = (version: ProjectVersion) => {
		console.log('Selected project version:', version);

		// Check if the project is ready
		if (!version.ready) {
			alert('Project is not ready yet');
			return;
		}

		// Go to editor page referencing the selected project
		// goto(`/editor?project=${project.id}&version=edit1`);
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
		width: 80%;
		margin: 100px auto;
	}
</style>
