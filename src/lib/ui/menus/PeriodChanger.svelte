<script lang="ts">
	import Spinner from '$lib/UI/common/Spinner.svelte';
	import ScrollArea from '$lib/components/ui/scroll-area/scroll-area.svelte';
	import { cn } from '$lib/utils/shadcn';
	import * as geotiff from 'geotiff';
	import { WebPConverter } from '$lib/utils/webp';
	import { TriangleAlertIcon } from '@lucide/svelte';

	type Props = {
		file: File;
		start_period: number;
		channel_period: number;
	};

	let { file, start_period = $bindable(0), channel_period = $bindable(1) }: Props = $props();

	let previewUrls: string[] = $state([]);
	let isDecoding = $state(false);
	let decodeError = $state<string | null>(null);

	let selectedStartIndex: number | null = $state(null);
	let isSelecting = $derived(selectedStartIndex !== null);

	// Decode preview frames when file is selected/changed
	$effect(() => {
		if (!file) return;

		isDecoding = true;
		decodeError = null;

		extractPreview(file)
			.catch((err) => {
				console.error(err);
				decodeError = 'Failed to decode preview frames from TIFF video file.';
			})
			.finally(() => {
				isDecoding = false;
			});

		return () => {
			previewUrls.forEach((url) => URL.revokeObjectURL(url));
			previewUrls = [];
		};
	});

	async function extractPreview(videoFile: File) {
		const tiff = await geotiff.fromBlob(videoFile);
		const count = await tiff.getImageCount();

		// Only decode up to 10 frames to spare memory
		const previewCount = Math.min(count, 10);
		const webpConverter = new WebPConverter();
		const urls: string[] = [];

		for (let i = 0; i < previewCount; i++) {
			const image = await tiff.getImage(i);
			const webpBlob = await webpConverter.tiffImageToWebP(image, { normalizeRgb: true });
			urls.push(URL.createObjectURL(webpBlob));
		}
		previewUrls = urls;
	}

	function handleClick(index: number) {
		if (selectedStartIndex === null) {
			selectedStartIndex = index;
		} else {
			start_period = selectedStartIndex;
			channel_period = index + 1;
			selectedStartIndex = null;
		}
	}

	function isPrimaryFrame(index: number): boolean {
		if (channel_period <= 0) return false;
		return index >= start_period && (index - start_period) % channel_period === 0;
	}
</script>

<div class="flex w-full min-w-0 flex-col gap-1">
	{#if isDecoding}
		<div
			class="border-muted-foreground/10 flex flex-col items-center justify-center gap-2 rounded-xl border-2 py-8"
		>
			<Spinner size={24} thickness={3} />
			<p class="text-muted-foreground animate-pulse text-xs">Decoding preview frames...</p>
		</div>
	{:else if decodeError}
		<div
			class="text-destructive border-destructive/10 flex flex-col items-center justify-center gap-2 rounded-xl border-2 py-8 text-center"
		>
			<TriangleAlertIcon class="size-6" />
			<p class="text-xs font-semibold">{decodeError}</p>
		</div>
	{:else}
		<ScrollArea
			orientation="horizontal"
			class="w-full min-w-0 pb-2.5"
			scrollbarXClasses="h-2.5 data-[orientation=horizontal]:h-2.5 data-[size=small]:h-1.5"
		>
			<div
				class="border-secondary flex rounded-tl-xl rounded-bl-xl border-2 border-r-0 p-px transition-all duration-200"
				class:border-dashed={isSelecting}
			>
				{#each previewUrls as frameUrl, index (frameUrl)}
					<button
						type="button"
						class={cn(
							'm-0 flex aspect-square h-20 cursor-pointer items-center justify-center overflow-hidden bg-transparent p-0 outline-none first:rounded-tl-lg first:rounded-bl-lg',
							isPrimaryFrame(index) ? 'border-accent border' : ''
						)}
						class:mr-2={index % channel_period === channel_period - 1}
						onclick={() => handleClick(index)}
					>
						<img
							src={frameUrl}
							alt="Preview"
							class="pointer-events-none aspect-square h-full object-cover"
						/>
					</button>
				{/each}
			</div>
		</ScrollArea>
		<span class="text-muted-foreground text-left text-sm italic">
			{#if !isSelecting}
				Click to change the first primary frame...
			{:else}
				Click to select the end of the period...
			{/if}
		</span>
	{/if}
</div>
