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

<div class="flex justify-center w-4/5 mx-auto mt-[100px]">
	<ProjectList onSelect={handleSelect} />
</div>
