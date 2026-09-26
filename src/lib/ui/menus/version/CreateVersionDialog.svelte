<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import FileUploadInput from '$lib/ui/common/FileUploadInput.svelte';
	import { LoaderCircleIcon } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { toastError } from '$lib/api/errors';
	import { copyProjectVersion, createProjectVersion } from '$lib/api/projects';
	import { readAnnotationFile } from '$lib/states/ProjectState.svelte';
	import type { Project, ProjectVersion } from '$lib/types/api.type';

	type Props = {
		project: Project;
		copyFromVersion: ProjectVersion | undefined;
		isOpen: boolean;
		onRefresh: () => void;
	};
	let { project, copyFromVersion, isOpen = $bindable(false), onRefresh }: Props = $props();

	const uid = $props.id();

	let newVersionName = $state('');
	let importAnnotation = $state(false);
	let annotationFile: File | null = $state(null);
	let busy = $state(false);
	let canSubmit = $derived(
		!!newVersionName.trim() && (!importAnnotation || !!annotationFile) && !busy
	);

	$effect(() => {
		if (!isOpen) return;
		newVersionName = copyFromVersion ? copyFromVersion.name + ' (copy)' : '';
		importAnnotation = false;
		annotationFile = null;
	});

	async function createVersion(name: string) {
		if (copyFromVersion) return copyProjectVersion(copyFromVersion, { name });
		const data =
			importAnnotation && annotationFile
				? await readAnnotationFile(annotationFile)
				: undefined;
		return createProjectVersion(project.id, { name, data });
	}

	function handleCreateVersion(e: SubmitEvent) {
		e.preventDefault();
		if (!canSubmit) return;

		busy = true;
		createVersion(newVersionName)
			.then(() => {
				toast.success('Version created');
				isOpen = false;
				newVersionName = '';
				onRefresh();
			})
			.catch((error: unknown) => {
				toastError('Failed to create version', error);
			})
			.finally(() => {
				busy = false;
			});
	}
</script>

<!-- Create version dialog -->
<Dialog.Root bind:open={isOpen}>
	<Dialog.Content>
		<form class="grid gap-4" onsubmit={handleCreateVersion}>
			<Dialog.Header>
				<Dialog.Title>New Version</Dialog.Title>
				{#if copyFromVersion}
					<Dialog.Description>Copying "{copyFromVersion.name}"</Dialog.Description>
				{/if}
			</Dialog.Header>

			<div class="grid gap-4">
				<Input bind:value={newVersionName} placeholder="Name" />

				<!-- A copy brings its own data -->
				{#if !copyFromVersion}
					<Label for="{uid}-import" class="flex items-center gap-2 select-none">
						<Checkbox id="{uid}-import" bind:checked={importAnnotation} /> Import annotation
					</Label>

					{#if importAnnotation}
						<FileUploadInput
							label="Annotation"
							accept=".json"
							bind:file={annotationFile}
						/>
					{/if}
				{/if}
			</div>

			<Dialog.Footer>
				<Dialog.Close class={buttonVariants({ variant: 'secondary' })} disabled={busy}>
					Cancel
				</Dialog.Close>
				<Button type="submit" disabled={!canSubmit}>
					{#if busy}
						<LoaderCircleIcon data-icon="inline-start" class="animate-spin" />
					{/if}
					Create
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
