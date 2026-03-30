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
	import CheckBox from '../Common/CheckBox.svelte';
	import ColorPicker from '../Common/ColorPicker.svelte';
	import Slider from '../Common/Slider.svelte';
	import TextBox from '../Common/TextBox.svelte';
	import { Button } from '$lib/components/ui/button';
	import { dataTypeToText, download } from '$lib/utils/data.svelte';
	import { modifierKeys } from '$lib/stores/input';
</script>

<nav
	class="flex flex-col w-[300px] h-full p-[1.3em] overflow-y-auto border-[var(--accent-color)] {$sidebarRight
		? 'border-l-[3px] order-3'
		: 'border-r-[3px] order-1'}"
>
	<p class="text-center text-[30px] font-semibold mt-1.5 mb-3.5">Debug</p>
	<div>
		<CheckBox bind:checked={$isSvgShown}>Show SVG</CheckBox>

		<CheckBox bind:checked={$svgStrokeSwitch}>Stroke</CheckBox>

		<ColorPicker bind:value={$svgStroke}>SVG stroke color...</ColorPicker>

		<CheckBox bind:checked={$svgFillSwitch}>Fill</CheckBox>

		<ColorPicker bind:value={$svgFill}>SVG fill color...</ColorPicker>

		<Slider bind:value={$svgAlpha} max={255}>SVG opacity</Slider>

		<Slider bind:value={$contextMenuOpacity} max={100}>Context menu opacity</Slider>

		<CheckBox bind:checked={$isEditing} disabled={!$isEditing}>Edit mode</CheckBox>

		<CheckBox bind:checked={$pointerLockEnabled}>Enable pointer lock</CheckBox>

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

		<TextBox bind:value={$globalColormap}>Color map</TextBox>

		<CheckBox bind:checked={$sidebarRight}>Sidebar on the right</CheckBox>

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
