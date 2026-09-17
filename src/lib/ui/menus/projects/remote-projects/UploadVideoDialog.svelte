<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import PeriodChanger from '../../PeriodChanger.svelte';
	import FileUploadInput from '$lib/ui/common/FileUploadInput.svelte';
	import { VideoColor, type Project, type VideoConfig } from '$lib/types/api.type';
	import { uploadVideo } from '$lib/api/projects';
	import { toast } from 'svelte-sonner';
	import { extractError } from '$lib/api/errors';
	import { LoaderCircleIcon } from '@lucide/svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';

	type Props = {
		project: Project;
		isOpen: boolean;
		onRefresh: () => void;
	};

	let { project, isOpen = $bindable(false), onRefresh }: Props = $props();

	let file = $state<File | null>(null);
	let isUploading = $state(false);

	let color = $state(VideoColor.GRAYSCALE);
	let start_period = $state(0);
	let channel_period = $state(1);

	// Reset state when dialog closes
	$effect(() => {
		if (!isOpen) {
			file = null;
			color = VideoColor.GRAYSCALE;
			start_period = 0;
			channel_period = 1;
		}
	});

	function handleUpload(e: SubmitEvent) {
		e.preventDefault();
		if (!file || isUploading) return;

		isUploading = true;

		const videoConfig: VideoConfig = { color, start_period, channel_period };
		const uploadPromise = uploadVideo(project.id, file, videoConfig);

		toast.promise(uploadPromise, {
			loading: 'Uploading video...',
			success: 'Video uploaded',
			error: (err) => `Failed to upload video: ${extractError(err)}`
		});

		uploadPromise
			.then(() => {
				isOpen = false;
				onRefresh();
			})
			.catch((err) => console.error(err))
			.finally(() => {
				isUploading = false;
			});
	}
</script>

<AlertDialog.Root bind:open={isOpen}>
	<AlertDialog.Content class="max-w-xl">
		<form class="grid gap-4" onsubmit={handleUpload}>
			<AlertDialog.Header>
				<AlertDialog.Title>Upload Video</AlertDialog.Title>
			</AlertDialog.Header>

			<div class="grid gap-4">
				<FileUploadInput label="Video File" accept=".tif,.tiff" bind:file />

				{#if file}
					<Label
						for="upload-grayscale"
						class="flex cursor-pointer items-center gap-2 select-none"
					>
						<Checkbox
							id="upload-grayscale"
							checked={color === VideoColor.GRAYSCALE}
							onCheckedChange={(checked) =>
								(color = checked ? VideoColor.GRAYSCALE : VideoColor.RGB)}
						/>
						Grayscale
					</Label>

					<Separator />

					<PeriodChanger {file} bind:start_period bind:channel_period />
				{/if}
			</div>

			<AlertDialog.Footer>
				<AlertDialog.Cancel
					class={buttonVariants({ variant: 'secondary' })}
					disabled={isUploading}
				>
					Cancel
				</AlertDialog.Cancel>
				<Button type="submit" disabled={!file || isUploading}>
					{#if isUploading}
						<LoaderCircleIcon data-icon="inline-start" class="animate-spin" />
					{/if}
					Upload
				</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
