<script lang="ts">
	import {
		isSvgShown,
		svgStroke,
		svgFill,
		svgAlpha,
		svgStrokeSwitch,
		svgFillSwitch
	} from '$lib/stores/svg';
	import { pointerLockEnabled, sidebarRight } from '$lib/stores/options';
	import { isEditing } from '$lib/stores/editor';
	import { scrollMultiplier } from '$lib/stores/zoom';
	import { globalColormap } from '$lib/stores/images';
	import {
		currentFrameId,
		displayFrames,
		currentChangeIndex,
		annotation
	} from '$lib/stores/data';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import ColorPicker from '../Common/ColorPicker.svelte';
	import { Slider } from '$lib/components/ui/slider';
	import { Button } from '$lib/components/ui/button';
	import { getMax, getMin } from '$lib/utils/data.svelte';
	import { pressedKeys } from '$lib/stores/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as Select from '$lib/components/ui/select';
	import { AVAILABLE_COLORMAPS } from '$lib/utils/imaging';
</script>

<nav
	class="flex flex-col w-80 h-full px-6 py-4 overflow-y-auto border-accent {$sidebarRight
		? 'border-l-1 order-3'
		: 'border-r-1 order-1'}"
>
	<h2 class="text-center text-2xl font-semibold mt-1.5 mb-3.5">Graphics</h2>
	<div class="flex flex-col gap-4 pb-6">
		<div class="flex flex-col gap-2">
			<Label>Color map</Label>
			<Select.Root type="single" bind:value={$globalColormap}>
				<Select.Trigger>
					{$globalColormap}
				</Select.Trigger>
				<Select.Content>
					{#each AVAILABLE_COLORMAPS as colormap}
						<Select.Item value={colormap}>{colormap}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</div>

	<h2 class="text-center text-2xl font-semibold mt-1.5 mb-3.5">Debug</h2>
	<div class="flex flex-col gap-4">
		<div class="flex items-center">
			<Switch id="is-svg-shown" bind:checked={$isSvgShown} />
			<Label for="is-svg-shown" class="pl-2 cursor-pointer">Show SVG</Label>
		</div>

		<div class="flex items-center">
			<Switch id="svg-stroke-switch" bind:checked={$svgStrokeSwitch} />
			<Label for="svg-stroke-switch" class="pl-2 cursor-pointer">Stroke</Label>
		</div>

		<ColorPicker bind:value={$svgStroke}>SVG stroke color...</ColorPicker>

		<div class="flex items-center">
			<Switch id="svg-fill-switch" bind:checked={$svgFillSwitch} />
			<Label for="svg-fill-switch" class="pl-2 cursor-pointer">Fill</Label>
		</div>

		<ColorPicker bind:value={$svgFill}>SVG fill color...</ColorPicker>

		<div class="flex flex-col gap-2">
			<Label for="svg-alpha" class="text-nowrap">SVG opacity</Label>
			<Slider id="svg-alpha" type="single" bind:value={$svgAlpha} max={255} />
		</div>

		<div class="flex items-center">
			<Switch id="is-editing" bind:checked={$isEditing} />
			<Label for="is-editing" class="pl-2 cursor-pointer">Edit mode</Label>
		</div>

		<div class="flex items-center">
			<Switch id="pointer-lock-enabled" bind:checked={$pointerLockEnabled} />
			<Label for="pointer-lock-enabled" class="pl-2 cursor-pointer">Enable pointer lock</Label
			>
		</div>

		<div class="flex flex-col gap-2">
			<Label>Zoom multiplier</Label>
			<Slider type="single" bind:value={$scrollMultiplier} min={0.1} max={10} />
		</div>

		<div class="flex flex-col gap-2">
			<Label for="current-frame-id" class="text-nowrap">
				Current frame: {$currentFrameId}
			</Label>
			<Slider
				type="single"
				bind:value={$currentFrameId}
				min={getMin($displayFrames.map((f) => f.id))}
				max={getMax($displayFrames.map((f) => f.id))}
				disabled={$isEditing}
			/>
		</div>

		<Slider bind:value={$currentChangeIndex} min={-1} max={$annotation.changes.length - 1}
			>Change index</Slider
		>

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
