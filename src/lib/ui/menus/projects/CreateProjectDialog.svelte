<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Progress } from '$lib/components/ui/progress';
	import { Separator } from '$lib/components/ui/separator';
	import FileUploadInput from '$lib/ui/common/FileUploadInput.svelte';
	import PeriodChanger from '../PeriodChanger.svelte';
	import { extractError } from '$lib/api/errors';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import { VideoColor } from '$lib/types/api.type';
	import { LoaderCircleIcon } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { slide } from 'svelte/transition';

	type Props = {
		open: boolean;
		local?: boolean;
		onCreated?: (id: string | number) => void;
	};

	let { open = $bindable(false), local = false, onCreated }: Props = $props();

	const uid = $props.id();

	let name = $state('');
	let videoFile: File | null = $state(null);
	let color = $state(VideoColor.GRAYSCALE);
	let start_period = $state(0);
	let channel_period = $state(1);
	let importAnnotation = $state(false);
	let annotationFile: File | null = $state(null);

	// Progress message while creating, null when idle
	let progress: string | null = $state(null);
	let progressValue: number | null = $state(null);
	let busy = $derived(progress !== null);
	let canSubmit = $derived(
		!!videoFile && !!name.trim() && (!importAnnotation || !!annotationFile) && !busy
	);

	// Reset the form whenever the dialog closes
	$effect(() => {
		if (open) return;
		name = '';
		videoFile = null;
		color = VideoColor.GRAYSCALE;
		start_period = 0;
		channel_period = 1;
		importAnnotation = false;
		annotationFile = null;
	});

	async function onsubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!canSubmit || !videoFile) return;

		progress = 'Preparing...';
		progressValue = null;
		try {
			const id = await projectState[local ? 'createLocalProject' : 'createCloudProject'](
				name.trim(),
				{ color, start_period, channel_period },
				videoFile,
				importAnnotation ? annotationFile : null,
				(message, fraction) => {
					progress = message;
					progressValue = fraction ?? null;
				}
			);
			toast.success('Project created');
			open = false;
			onCreated?.(id);
		} catch (error) {
			toast.error("Couldn't create the project", { description: extractError(error) });
		} finally {
			progress = null;
			progressValue = null;
		}
	}
</script>

<Dialog.Root bind:open>
	<!-- No dismissing while the work is running -->
	<Dialog.Content
		class="sm:max-w-xl"
		showCloseButton={!busy}
		onInteractOutside={(e) => busy && e.preventDefault()}
		onEscapeKeydown={(e) => busy && e.preventDefault()}
	>
		<form class="grid gap-4" {onsubmit}>
			<Dialog.Header>
				<Dialog.Title>{local ? 'New local project' : 'New project'}</Dialog.Title>
				{#if local}
					<Dialog.Description>
						The video and annotation are stored locally.<br />
						Anyone with access to this browser will be able to view them.
					</Dialog.Description>
				{/if}
			</Dialog.Header>

			<div class="grid gap-4">
				<div class="grid gap-2">
					<Label for="{uid}-name">Name</Label>
					<Input id="{uid}-name" bind:value={name} placeholder="Project name" />
				</div>

				<FileUploadInput label="Video" accept=".tif,.tiff" bind:file={videoFile} />

				{#if videoFile}
					<Label
						for="{uid}-grayscale"
						class="flex cursor-pointer items-center gap-2 select-none"
					>
						<Checkbox
							id="{uid}-grayscale"
							checked={color === VideoColor.GRAYSCALE}
							onCheckedChange={(checked) =>
								(color = checked ? VideoColor.GRAYSCALE : VideoColor.RGB)}
						/> Grayscale
					</Label>

					<Separator />

					<PeriodChanger file={videoFile} bind:start_period bind:channel_period />

					<Separator />
				{/if}

				<Label
					for="{uid}-import"
					class="flex cursor-pointer items-center gap-2 select-none"
				>
					<Checkbox
						id="{uid}-import"
						checked={importAnnotation}
						onCheckedChange={(checked) => (importAnnotation = checked)}
					/> Import annotation
				</Label>

				{#if importAnnotation}
					<FileUploadInput label="Annotation" accept=".json" bind:file={annotationFile} />
				{/if}
			</div>

			<Dialog.Footer class="items-center">
				{#if busy}
					<div class="mr-auto flex min-w-0 flex-1 flex-col items-start">
						<span class="text-muted-foreground text-left text-sm">
							{progress}
						</span>
						{#if progressValue !== null}
							<div class="mt-1.5 w-full" transition:slide={{ duration: 400 }}>
								<Progress value={progressValue * 100} class="max-w-36" />
							</div>
						{/if}
					</div>
				{/if}
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
