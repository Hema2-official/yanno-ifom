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
	import {
		STACK_PITCH,
		STACK_YAW,
		videoDisplayState,
		type DisplayMode
	} from '$lib/states/VideoDisplayState.svelte';
	import type { SettingState } from '$lib/states/SettingState.svelte';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import ColorMapSelect from '$lib/ui/common/ColorMapSelect.svelte';
	import HistoryList from '$lib/ui/common/HistoryList.svelte';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { RotateCcwIcon } from '@lucide/svelte';

	const primaryChannelIndex = $derived(projectState.videoConfig?.start_period ?? 0);
	const isStack = $derived(videoDisplayState.displayMode.current === 'stack');
	const lastShownFrameIndex = $derived(
		annotationState.currentFrameIndex + videoDisplayState.concurrentFrames - 1
	);

	function readableLabelKey(key: LabelKey): string {
		return key.replace(/([a-z])([A-Z])/g, '$1 $2');
	}

	type Slider = {
		format: (value: number) => string;
		min: number;
		max: number;
		step: number;
	};

	const percent = (value: number) => (value * 100).toFixed(0) + '%';

	type ChannelSlider = Slider & { key: 'opacity' | 'brightness' | 'contrast' | 'gamma' };
	const channelSliders: ChannelSlider[] = [
		{ key: 'opacity', format: percent, min: 0, max: 1, step: 0.01 },
		{ key: 'brightness', format: percent, min: -1, max: 1, step: 0.01 },
		{ key: 'contrast', format: percent, min: 0, max: 3, step: 0.01 },
		{ key: 'gamma', format: (v) => v.toFixed(2), min: 0.2, max: 4, step: 0.05 }
	];

	// We lie about the accurate angles to prevent snapping after turns
	const roundDegrees = (value: number) => `${Math.round(value)}°`;

	type StackSlider = Slider & { label: string; setting: SettingState<number> };
	const stackSliders: StackSlider[] = [
		{
			label: 'Angle',
			setting: videoDisplayState.stackYaw,
			format: roundDegrees,
			...STACK_YAW,
			step: 0.1
		},
		{
			label: 'Tilt',
			setting: videoDisplayState.stackPitch,
			format: roundDegrees,
			...STACK_PITCH,
			step: 0.1
		},
		{
			label: 'Spacing',
			setting: videoDisplayState.stackSpacing,
			format: percent,
			min: 0.01,
			max: 1,
			step: 0.01
		},
		{
			label: 'Fade',
			setting: videoDisplayState.stackFade,
			format: percent,
			min: 0,
			max: 0.9,
			step: 0.01
		}
	];

	const selectLayout = (mode: DisplayMode | undefined) => {
		// Pressing the active item would deselect it
		if (mode) videoDisplayState.displayMode.current = mode;
	};
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

			<Label for="annotation-switch" class="cursor-pointer">
				<Switch id="annotation-switch" bind:checked={svgState.isAnnotationShown} /> Show annotation
			</Label>

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

			<Label for="ancestry-switch" class="cursor-pointer">
				<Switch id="ancestry-switch" bind:checked={svgState.ancestrySwitch.current} />
				Ancestry arrows
			</Label>
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

			<div class="flex items-center justify-between gap-2">
				<Label>Layout</Label>
				<ToggleGroup.Root
					type="single"
					variant="outline"
					size="sm"
					bind:value={() => videoDisplayState.displayMode.current, selectLayout}
				>
					<ToggleGroup.Item value="grid">Grid</ToggleGroup.Item>
					<ToggleGroup.Item value="stack">Stack</ToggleGroup.Item>
				</ToggleGroup.Root>
			</div>

			<div class="flex flex-col gap-2">
				<Label for="concurrent-frames" class="text-nowrap tabular-nums">
					Concurrent frames: {videoDisplayState.concurrentFrames}
				</Label>
				<Slider
					id="concurrent-frames"
					type="single"
					bind:value={videoDisplayState.concurrentFrames}
					min={1}
					max={videoDisplayState.maxConcurrentFrames}
					step={1}
					disabled={videoDisplayState.maxConcurrentFrames < 2}
				/>
			</div>

			{#if isStack}
				<div class="flex flex-col gap-2">
					{#each stackSliders as { label, setting, format, ...range } (label)}
						<div class="grid grid-cols-[6.5rem_1fr] items-center gap-2">
							<span class="text-muted-foreground text-sm tabular-nums">
								{label}: {format(setting.current)}
							</span>
							<Slider type="single" bind:value={setting.current} {...range} />
						</div>
					{/each}
				</div>
			{/if}

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
					max={videoDisplayState.maxFrameIndex}
					step={1}
					disabled={projectState.frameCount === 0}
				/>
			</div>
		</div>

		<h2 class="mt-1.5 mb-3.5 text-center text-2xl font-semibold">History</h2>
		<HistoryList class="max-h-64" />
	</ScrollArea>
</aside>
