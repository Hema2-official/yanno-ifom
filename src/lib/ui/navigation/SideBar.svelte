<script lang="ts">
	import { svgState } from '$lib/states/svg.svelte';
	import { optionsState } from '$lib/states/options.svelte';
	import { isEditing } from '$lib/stores/editor';
	import { zoomState } from '$lib/states/zoom.svelte';
	import { Label } from '$lib/components/ui/label';
	import ColorPicker from '$lib/ui/common/ColorPicker.svelte';
	import { Slider } from '$lib/components/ui/slider';
	import { Button } from '$lib/components/ui/button';
	import { getMax, getMin } from '$lib/utils/data.svelte';
	import { pressedKeys } from '$lib/stores/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as Select from '$lib/components/ui/select';
	import { AVAILABLE_COLORMAPS } from '$lib/utils/imaging';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
</script>

<nav
	class="flex flex-col w-80 h-full px-6 py-4 overflow-y-auto border-accent {optionsState.sidebarRight
		? 'border-l-1 order-3'
		: 'border-r-1 order-1'}"
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
		<div class="flex items-center">
			<Switch id="is-svg-shown" bind:checked={svgState.isSvgShown} />
			<Label for="is-svg-shown" class="pl-2 cursor-pointer">Show SVG</Label>
		</div>

		<div class="flex items-center">
			<Switch id="svg-stroke-switch" bind:checked={svgState.svgStrokeSwitch} />
			<Label for="svg-stroke-switch" class="pl-2 cursor-pointer">Stroke</Label>
		</div>

		<ColorPicker bind:value={svgState.svgStroke}>SVG stroke color...</ColorPicker>

		<div class="flex items-center">
			<Switch id="svg-fill-switch" bind:checked={svgState.svgFillSwitch} />
			<Label for="svg-fill-switch" class="pl-2 cursor-pointer">Fill</Label>
		</div>

		<ColorPicker bind:value={svgState.svgFill}>SVG fill color...</ColorPicker>

		<div class="flex flex-col gap-2">
			<Label for="svg-alpha" class="text-nowrap">SVG opacity</Label>
			<Slider id="svg-alpha" type="single" bind:value={svgState.svgAlpha} max={255} />
		</div>

		<div class="flex items-center">
			<Switch id="is-editing" bind:checked={$isEditing} />
			<Label for="is-editing" class="pl-2 cursor-pointer">Edit mode</Label>
		</div>

		<div class="flex items-center">
			<Switch id="pointer-lock-enabled" bind:checked={optionsState.pointerLockEnabled} />
			<Label for="pointer-lock-enabled" class="pl-2 cursor-pointer">Enable pointer lock</Label
			>
		</div>

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

		<!-- <Slider bind:value={$currentChangeIndex} min={-1} max={$annotation.changes.length - 1}
			>Change index</Slider
		> -->

		<Button
			variant="destructive"
			onclick={() => {
				sessionStorage.clear();
				location.reload();
			}}>Delete session</Button
		>

		<p class="m-0">shift: {pressedKeys.has('Shift')}</p>
		<p class="m-0">ctrl: {pressedKeys.has('Control')}</p>
		<p class="m-0">alt: {pressedKeys.has('Alt')}</p>
		<p class="m-0">meta: {pressedKeys.has('Meta')}</p>
	</div>
</nav>
