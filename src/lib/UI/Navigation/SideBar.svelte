<script lang="ts">
	import {
		isSvgShown,
		svgStroke,
		svgFill,
		svgAlpha,
		svgStrokeSwitch,
		svgFillSwitch
	} from '$lib/stores/svg';
	import { contextMenuOpacity, pointerLockEnabled, sidebarRight } from '$lib/stores/options';
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
	import Slider from '../Common/Slider.svelte';
	import TextBox from '../Common/TextBox.svelte';
	import { Button } from '$lib/components/ui/button';
	import { dataTypeToText, download } from '$lib/utils/data.svelte';
	import { modifierKeys } from '$lib/stores/input';
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
		<div class="flex items-center gap-2">
			<Checkbox id="isSvgShown" bind:checked={$isSvgShown} />
			<Label for="isSvgShown">Show SVG</Label>
		</div>

		<div class="flex items-center gap-2">
			<Checkbox id="svgStrokeSwitch" bind:checked={$svgStrokeSwitch} />
			<Label for="svgStrokeSwitch">Stroke</Label>
		</div>

		<ColorPicker bind:value={$svgStroke}>SVG stroke color...</ColorPicker>

		<div class="flex items-center gap-2">
			<Checkbox id="svgFillSwitch" bind:checked={$svgFillSwitch} />
			<Label for="svgFillSwitch">Fill</Label>
		</div>

		<ColorPicker bind:value={$svgFill}>SVG fill color...</ColorPicker>

		<Slider bind:value={$svgAlpha} max={255}>SVG opacity</Slider>

		<Slider bind:value={$contextMenuOpacity} max={100}>Context menu opacity</Slider>

		<div class="flex items-center gap-2">
			<Checkbox id="isEditing" bind:checked={$isEditing} disabled={!$isEditing} />
			<Label for="isEditing">Edit mode</Label>
		</div>

		<div class="flex items-center gap-2">
			<Checkbox id="pointerLockEnabled" bind:checked={$pointerLockEnabled} />
			<Label for="pointerLockEnabled">Enable pointer lock</Label>
		</div>

		<Slider bind:value={$scrollMultiplier} min={0.1} max={10}>Zoom multiplier</Slider>

		<Slider
			bind:value={$currentFrameId}
			min={Math.min(...$displayFrames.map((f) => f.id))}
			max={Math.max(...$displayFrames.map((f) => f.id))}
			disabled={$isEditing}>Frame ID</Slider
		>

		<Slider bind:value={$currentChangeIndex} min={-1} max={$annotation.changes.length - 1}
			>Change index</Slider
		>


		<div class="flex items-center gap-2">
			<Checkbox id="sidebarRight" bind:checked={$sidebarRight} />
			<Label for="sidebarRight">Sidebar on the right</Label>
		</div>

		<Button
			click={() => {
				download(dataTypeToText($annotation, $currentChangeIndex), 'output.txt');
			}}>Save as .txt</Button
		>

		<Button
			variant="destructive"
			onclick={() => {
				sessionStorage.clear();
				location.reload();
			}}>Delete session</Button
		>

		<p class="m-0">shift: {$modifierKeys.shift}</p>
		<p class="m-0">ctrl: {$modifierKeys.ctrl}</p>
		<p class="m-0">alt: {$modifierKeys.alt}</p>
		<p class="m-0">meta: {$modifierKeys.meta}</p>
	</div>
</nav>
