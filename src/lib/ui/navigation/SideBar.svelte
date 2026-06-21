<script lang="ts">
	import { svgState } from '$lib/states/svg.svelte';
	import { optionsState } from '$lib/states/options.svelte';
	import { isEditing } from '$lib/stores/editor';
	import { zoomState } from '$lib/states/zoom.svelte';
	import { Label } from '$lib/components/ui/label';
	import ColorPicker from '$lib/ui/common/ColorPicker.svelte';
	import { Slider } from '$lib/components/ui/slider';
	import { getMax, getMin } from '$lib/utils/data.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import * as Select from '$lib/components/ui/select';
	import { AVAILABLE_COLORMAPS } from '$lib/utils/imaging';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
</script>

<nav
	class="flex flex-col w-80 h-full px-6 py-4 overflow-y-auto border-accent {optionsState.sidebarRight
		? 'border-l order-3'
		: 'border-r order-1'}"
>
	<h2 class="text-center text-2xl font-semibold mt-1.5 mb-3.5">Graphics</h2>
	<div class="flex flex-col gap-4 pb-6">
		<div class="flex flex-col gap-2">
			<Label>Color map</Label>
			<Select.Root type="single" bind:value={svgState.videoColormap}>
				<Select.Trigger>
					{svgState.videoColormap}
				</Select.Trigger>
				<Select.Content>
					{#each AVAILABLE_COLORMAPS as colormap (colormap)}
						<Select.Item value={colormap}>{colormap}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</div>

	<h2 class="text-center text-2xl font-semibold mt-1.5 mb-3.5">Debug</h2>
	<div class="flex flex-col gap-4">
		<Label for="is-svg-shown" class="cursor-pointer">
			<Switch id="is-svg-shown" bind:checked={svgState.isSvgShown} /> Show SVG
		</Label>

		<Label for="svg-stroke-switch" class="cursor-pointer">
			<Switch id="svg-stroke-switch" bind:checked={svgState.svgStrokeSwitch} /> Stroke
		</Label>

		<Label for="svg-stroke-color" class="cursor-pointer">
			<ColorPicker id="svg-stroke-color" bind:value={svgState.svgStroke} /> Stroke color
		</Label>

		<Label for="svg-fill-switch" class="cursor-pointer">
			<Switch id="svg-fill-switch" bind:checked={svgState.svgFillSwitch} /> Fill
		</Label>

		<Label for="svg-fill-color" class="cursor-pointer">
			<ColorPicker id="svg-fill-color" bind:value={svgState.svgFill} /> Fill color
		</Label>

		<div class="flex flex-col gap-2">
			<Label for="svg-alpha" class="text-nowrap">SVG opacity</Label>
			<Slider id="svg-alpha" type="single" bind:value={svgState.svgAlpha} max={255} />
		</div>

		<Label for="is-editing" class="cursor-pointer">
			<Switch id="is-editing" bind:checked={$isEditing} /> Edit mode
		</Label>

		<Label for="pointer-lock-enabled" class="cursor-pointer">
			<Switch id="pointer-lock-enabled" bind:checked={optionsState.pointerLockEnabled} />
			Enable pointer lock
		</Label>

		<div class="flex flex-col gap-2">
			<Label>Zoom multiplier</Label>
			<Slider type="single" bind:value={zoomState.scrollMultiplier} min={0.1} max={10} />
		</div>

		<div class="flex flex-col gap-2">
			<Label for="current-frame-id" class="text-nowrap">
				Current frame: {annotationState.currentFrameId}
			</Label>
			<Slider
				type="single"
				bind:value={annotationState.currentFrameId}
				min={annotationState.data
					? getMin(annotationState.data.current.map((f) => f.Frame))
					: 0}
				max={annotationState.data
					? getMax(annotationState.data.current.map((f) => f.Frame))
					: 0}
				disabled={$isEditing || !annotationState.data}
			/>
		</div>
	</div>
</nav>
