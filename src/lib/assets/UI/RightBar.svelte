<script>
	import { backend_url, isSvgShown, svgStroke, svgFill, svgAlpha, svgStrokeSwitch, svgFillSwitch } from '../../stores';
	import CheckBox from './CheckBox.svelte';
    import ColorPicker from './ColorPicker.svelte';
    import Slider from './Slider.svelte';
    import TextBox from './TextBox.svelte';

</script>

<nav class="right-container">

	<p class="title">Settings</p>
	<div class="group">
		<CheckBox
			checked={$isSvgShown}
			cb={(e) => ($isSvgShown = e.target ? e.target.checked : false)}
			>Show SVG</CheckBox
		>
		<CheckBox
			checked={$svgStrokeSwitch}
			cb={(e) => ($svgStrokeSwitch = e.target ? e.target.checked : false)}
			>Stroke</CheckBox
		>
		<ColorPicker
			value={$svgStroke}
			cp={(e) => ($svgStroke = e.target ? e.target.value : '#ffffff')}
			>SVG stroke color...</ColorPicker
		>
		<CheckBox
			checked={$svgFillSwitch}
			cb={(e) => ($svgFillSwitch = e.target ? e.target.checked : false)}
			>Fill</CheckBox
		>
		<ColorPicker
			value={$svgFill}
			cp={(e) => ($svgFill = e.target ? e.target.value : '#ffffff')}
			>SVG fill color...</ColorPicker
		>
		<Slider
			value={$svgAlpha}
			max={255}
			slide={(e) => ($svgAlpha = e.target.value)}
			>SVG opacity</Slider
		>
		
	</div>

	<TextBox
		value={$backend_url}
		tb={(e) => ($backend_url = e.target ? e.target.value : '')}
		>Backend url</TextBox
	>
	
</nav>