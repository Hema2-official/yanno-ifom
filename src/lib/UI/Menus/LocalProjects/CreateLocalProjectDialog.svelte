<script lang="ts">
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CheckIcon } from '@lucide/svelte';
	import FileUploadInput from '../../Common/FileUploadInput.svelte';
	import { watch } from 'runed';

	type Props = {
		isOpen: boolean;
	};

	let { isOpen = $bindable(false) }: Props = $props();

	let name = $state('');
	let imageFile: File | null = $state(null);
	let annotationFile: File | null = $state(null);

	watch([() => isOpen], () => {
		if (!isOpen) return;

		name = '';
		imageFile = null;
		annotationFile = null;
	});
</script>

<Dialog.Root bind:open={isOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Create local project</Dialog.Title>
			<Dialog.Description>
				Create a local project by uploading a video and an annotation file.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-3">
			<Label for="title">Name</Label>
			<Input id="title" type="text" bind:value={name} />
		</div>

		<FileUploadInput label="Video" accept=".tif,.tiff" bind:file={imageFile} />
		<FileUploadInput label="Annotation" accept=".json" bind:file={annotationFile} />

		<Dialog.Footer>
			<Dialog.Close class={buttonVariants({ variant: 'secondary' })}>Cancel</Dialog.Close>
			<Button disabled={!name || !imageFile || !annotationFile}>
				<CheckIcon />
				Create
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
