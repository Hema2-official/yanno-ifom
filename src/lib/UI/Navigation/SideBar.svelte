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
	import Button from '../Common/Button.svelte';
	import { dataTypeToText, download } from '$lib/utils/data';
	import { modifierKeys } from '$lib/stores/input';
</script>

<nav class="side-container {$sidebarRight ? 'right' : ''}">
	<p class="title">Debug</p>
	<div class="group">
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
			click={() => {
				sessionStorage.clear();
				location.reload();
			}}>Delete session</Button
		>

		<p>shift: {$modifierKeys.shift}</p>
		<p>ctrl: {$modifierKeys.ctrl}</p>
		<p>alt: {$modifierKeys.alt}</p>
		<p>meta: {$modifierKeys.meta}</p>
	</div>
</nav>

<style lang="scss">
	.side-container {
		display: flex;
		flex-direction: column;
		width: 300px;
		height: 100%;
		padding: 1.3em;
		border-right: 3px solid var(--accent-color);
		order: 1;
		overflow-y: scroll;

		&.right {
			border-right: none;
			border-left: 3px solid var(--accent-color);
			order: 3;
		}

		.title {
			text-align: center;
			font-size: 30px;
			font-weight: 600;
			margin-top: 6px;
			margin-bottom: 14px;
		}

		p {
			margin: 0;
		}
	}
</style>
