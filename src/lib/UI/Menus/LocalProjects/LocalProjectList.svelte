<script lang="ts">
	import ProjectListHeader from '../ProjectListHeader.svelte';
	import CreateLocalProjectDialog from './CreateLocalProjectDialog.svelte';

	let showCreateDialog = $state(false);
</script>

<div class="flex flex-col items-center gap-y-4 w-full">
	<ProjectListHeader
		title="Local Projects"
		onRefresh={() => {}}
		onNew={() => (showCreateDialog = true)}
	/>

	<CreateLocalProjectDialog bind:isOpen={showCreateDialog} />
</div>
