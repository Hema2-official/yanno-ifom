<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { extractError } from '$lib/api/errors';
	import { copyProjectVersion, createProjectVersion } from '$lib/api/projects';
	import type { Project, ProjectVersion } from '$lib/types/api.type';

	type Props = {
		project: Project;
		copyFromVersion: ProjectVersion | undefined;
		isOpen: boolean;
		onRefresh: () => void;
	};
	let { project, copyFromVersion, isOpen = $bindable(false), onRefresh }: Props = $props();

	let newVersionName = $state('');

	$effect(() => {
		if (!isOpen) return;
		newVersionName = copyFromVersion ? copyFromVersion.name + ' (copy)' : '';
	});

	function handleCreateVersion() {
		if (!newVersionName.trim()) return;

		const promise = copyFromVersion
			? copyProjectVersion(copyFromVersion, { name: newVersionName })
			: createProjectVersion(project.id, { name: newVersionName });

		promise
			.then(() => {
				toast.success('Version created');
				isOpen = false;
				newVersionName = '';
				onRefresh();
			})
			.catch((error: unknown) => {
				toast.error('Failed to create version', { description: extractError(error) });
			});
	}
</script>

<!-- Create version dialog -->
<Dialog.Root bind:open={isOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>New Version</Dialog.Title>
			{#if copyFromVersion}
				<Dialog.Description>Copying "{copyFromVersion.name}"</Dialog.Description>
			{/if}
		</Dialog.Header>

		<div class="grid gap-4">
			<Input
				bind:value={newVersionName}
				placeholder="Name"
				onkeydown={(e) => {
					if (e.key === 'Enter') handleCreateVersion();
				}}
			/>
		</div>

		<Dialog.Footer>
			<Dialog.Close class={buttonVariants({ variant: 'secondary' })}>Cancel</Dialog.Close>
			<Button onclick={handleCreateVersion} disabled={!newVersionName.trim()}>Create</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
