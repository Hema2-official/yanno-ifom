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

<div class="flex flex-col gap-1 w-full min-w-0">
	{#if isDecoding}
		<div
			class="flex flex-col items-center justify-center py-8 gap-2 border-2 border-muted-foreground/10 rounded-xl"
		>
			<Spinner size={24} thickness={3} />
			<p class="text-xs text-muted-foreground animate-pulse">Decoding preview frames...</p>
		</div>
	{:else if decodeError}
		<div
			class="flex flex-col items-center justify-center py-8 text-destructive gap-2 text-center border-2 border-destructive/10 rounded-xl"
		>
			<TriangleAlertIcon class="size-6" />
			<p class="text-xs font-semibold">{decodeError}</p>
		</div>
	{:else}
		<ScrollArea
			orientation="horizontal"
			class="pb-2.5 w-full min-w-0"
			scrollbarXClasses="h-2.5 data-[orientation=horizontal]:h-2.5 data-[size=small]:h-1.5"
		>
			<div
				class="flex border-2 border-light-gray-accent border-r-0 rounded-tl-xl rounded-bl-xl p-px transition-all duration-200"
				class:border-dashed={isSelecting}
			>
				{#each previewUrls as frameUrl, index (frameUrl)}
					<button
						type="button"
						class={cn(
							'flex items-center justify-center h-20 aspect-square overflow-hidden bg-transparent outline-none p-0 m-0 cursor-pointer first:rounded-tl-lg first:rounded-bl-lg',
							isPrimaryFrame(index) ? 'border border-accent' : ''
						)}
						class:mr-2={index % channel_period === channel_period - 1}
						onclick={() => handleClick(index)}
					>
						<img
							src={frameUrl}
							alt="Preview"
							class="h-full aspect-square object-cover pointer-events-none"
						/>
					</button>
				{/each}
			</div>
		</ScrollArea>
		<span class="text-sm text-gray-accent italic text-left">
			{#if !isSelecting}
				Click to change the first primary frame...
			{:else}
				Click to select the end of the period...
			{/if}
		</span>
	{/if}
</div>
