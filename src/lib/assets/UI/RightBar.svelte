<script>
	import { backend_url, isSvgShown, svgStroke, svgFill, svgAlpha, svgStrokeSwitch, svgFillSwitch, cmOpacity, isEditing } from '../../stores';
	import CheckBox from './CheckBox.svelte';
    import ColorPicker from './ColorPicker.svelte';
    import Slider from './Slider.svelte';
    import TextBox from './TextBox.svelte';

</script>

<nav class="right-container">

	<p class="title">Settings</p>
	<div class="group">
		<CheckBox
			bind:checked={$isSvgShown}
			>Show SVG</CheckBox
		>
		<CheckBox
			bind:checked={$svgStrokeSwitch}
			>Stroke</CheckBox
		>
		<ColorPicker
			bind:value={$svgStroke}
			>SVG stroke color...</ColorPicker
		>
		<CheckBox
			bind:checked={$svgFillSwitch}
			>Fill</CheckBox
		>
		<ColorPicker
			bind:value={$svgFill}
			>SVG fill color...</ColorPicker
		>
		<Slider
			bind:value={$svgAlpha}
			max={255}
			>SVG opacity</Slider
		>
		<Slider
			bind:value={$cmOpacity}
			max={100}
			>Context menu opacity</Slider
		>
		<CheckBox
			bind:checked={$isEditing}
			disabled={!$isEditing}
			>Edit mode</CheckBox
		>
		
	</div>

	<TextBox
		bind:value={$backend_url}
		>Backend url</TextBox
	>
	
</nav>

<style>
	.right-container {
		position: absolute;
		display: flex;
		flex-direction: column;
		width: var(--right-bar-width);
		height: 100%;
		top: 0;
		right: 0;
		padding: 1.3em;
		border-left: 0.2rem solid var(--accent-color);
		box-sizing: border-box;
	}
</style>