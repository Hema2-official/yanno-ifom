<script lang="ts">
	import { labelKeys, svgState, type LabelKey } from '$lib/states/svg.svelte';
	import { optionsState } from '$lib/states/options.svelte';
	import { Label } from '$lib/components/ui/label';
	import IconButton from '$lib/ui/common/IconButton.svelte';
	import * as Select from '$lib/components/ui/select';
	import { Slider } from '$lib/components/ui/slider';
	import { Switch } from '$lib/components/ui/switch';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import { videoDisplayState } from '$lib/states/VideoDisplayState.svelte';
	import ColorMapSelect from '$lib/ui/common/ColorMapSelect.svelte';
	import HistoryList from '$lib/ui/common/HistoryList.svelte';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { RotateCcwIcon } from '@lucide/svelte';

	const primaryChannelIndex = $derived(projectState.videoConfig?.start_period ?? 0);
	const maxConcurrentFrames = $derived(Math.max(1, Math.min(6, projectState.frameCount)));
	const maxFrameIndex = $derived(
		Math.max(0, projectState.frameCount - videoDisplayState.concurrentFrames)
	);
	const lastShownFrameIndex = $derived(
		annotationState.currentFrameIndex + videoDisplayState.concurrentFrames - 1
	);

	function readableLabelKey(key: LabelKey): string {
		return key.replace(/([a-z])([A-Z])/g, '$1 $2');
	}

	type ChannelSlider = {
		key: 'opacity' | 'brightness' | 'contrast' | 'gamma';
		format: (value: number) => string;
		min: number;
		max: number;
		step: number;
	};
	const percent = (value: number) => (value * 100).toFixed(0) + '%';
	const channelSliders: ChannelSlider[] = [
		{ key: 'opacity', format: percent, min: 0, max: 1, step: 0.01 },
		{ key: 'brightness', format: percent, min: -1, max: 1, step: 0.01 },
		{ key: 'contrast', format: percent, min: 0, max: 3, step: 0.01 },
		{ key: 'gamma', format: (v) => v.toFixed(2), min: 0.2, max: 4, step: 0.05 }
	];

	// Keep the frame window in range when the grid grows
	$effect(() => {
		if (annotationState.currentFrameIndex > maxFrameIndex)
			annotationState.currentFrameIndex = maxFrameIndex;
	});
</script>

<aside
	class="border-accent flex h-full w-80 flex-col
		{optionsState.sidebarRight.current ? 'order-3 border-l' : 'order-1 border-r'}"
>
	<ScrollArea class="h-full min-h-0 px-6 pt-4">
		<h2 class="mt-1.5 mb-3.5 text-center text-2xl font-semibold">Graphics</h2>
		<div class="flex flex-col gap-4 pb-6">
			<Label for="normalize-switch" class="cursor-pointer">
				<Switch id="normalize-switch" bind:checked={svgState.normalizeSwitch.current} /> Normalize
			</Label>

			<Label for="colormap-switch" class="cursor-pointer">
				<Switch id="colormap-switch" bind:checked={svgState.colormapSwitch.current} /> Colormap
			</Label>

			<div class="flex items-center gap-2">
				<Label>Color map:</Label>
				<ColorMapSelect bind:value={svgState.videoColormap.current} />
			</div>

			<div class="flex flex-col gap-2">
				<Label for="colormap-shades" class="text-nowrap">
					Shades: {svgState.videoColormapShades.current}
				</Label>
				<Slider
					id="colormap-shades"
					type="single"
					bind:value={svgState.videoColormapShades.current}
					min={16}
					max={256}
					step={1}
				/>
			</div>

			<div class="flex items-center gap-2">
				<Switch id="labels-switch" bind:checked={svgState.labelSwitch.current} />
				<Label for="labels-switch">Labels:</Label>
				<Select.Root type="single" bind:value={svgState.labelKey.current}>
					<Select.Trigger class="flex-1 font-normal" size="sm">
						{readableLabelKey(svgState.labelKey.current)}
					</Select.Trigger>
					<Select.Content>
						{#each labelKeys as value (value)}
							<Select.Item {value} label={readableLabelKey(value)} />
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
		</div>

		<h2 class="mt-1.5 mb-3.5 text-center text-2xl font-semibold">Video</h2>
		<div class="flex flex-col gap-4 pb-6">
			{#each videoDisplayState.channels as channel, channelIndex (channelIndex)}
				<div class="flex flex-col gap-2">
					<div class="flex h-6 items-center justify-between">
						<Label for="channel-{channelIndex}-visible" class="cursor-pointer">
							<Switch
								id="channel-{channelIndex}-visible"
								bind:checked={channel.visible}
							/>
							Channel {channelIndex}
							{#if channelIndex === primaryChannelIndex}(primary){/if}
						</Label>
						{#if channel.isAdjusted}
							<IconButton
								variant="ghost"
								size="icon-xs"
								label="Reset brightness, contrast and gamma"
								onclick={() => channel.resetAdjustments()}
							>
								<RotateCcwIcon />
							</IconButton>
						{/if}
					</div>
					{#if channel.visible}
						{#each channelSliders as { key, format, ...range } (key)}
							<div class="grid grid-cols-[6.5rem_1fr] items-center gap-2">
								<span class="text-muted-foreground text-sm capitalize tabular-nums">
									{key}: {format(channel[key])}
								</span>
								<Slider
									type="single"
									bind:value={channel[key]}
									{...range}
									disabled={!channel.visible}
								/>
							</div>
						{/each}
					{/if}
				</div>
			{/each}

			<div class="flex flex-col gap-2">
				<Label for="concurrent-frames" class="text-nowrap tabular-nums">
					Concurrent frames: {videoDisplayState.concurrentFrames}
				</Label>
				<Slider
					id="concurrent-frames"
					type="single"
					bind:value={videoDisplayState.concurrentFrames}
					min={1}
					max={maxConcurrentFrames}
					step={1}
					disabled={maxConcurrentFrames < 2}
				/>
			</div>

			<div class="flex flex-col gap-2">
				<Label for="current-frame-index" class="text-nowrap tabular-nums">
					{#if videoDisplayState.concurrentFrames > 1}
						Frames: {annotationState.currentFrameIndex}–{lastShownFrameIndex}
					{:else}
						Frame: {annotationState.currentFrameIndex}
					{/if}
				</Label>
				<Slider
					id="current-frame-index"
					type="single"
					bind:value={annotationState.currentFrameIndex}
					min={0}
					max={maxFrameIndex}
					step={1}
					disabled={projectState.frameCount === 0}
				/>
			</div>
		</div>

		<h2 class="mt-1.5 mb-3.5 text-center text-2xl font-semibold">History</h2>
		<HistoryList class="max-h-64" />
	</ScrollArea>
</aside>
