<script lang="ts">
    import { backend_url, isSvgShown, svgStroke, svgFill, svgAlpha, svgStrokeSwitch, svgFillSwitch, cmOpacity, isEditing, pointerLockEnabled, scrollMultiplier, currentFrameId, displayFrames, globalColormap, sidebarRight, currentChangeIndex, data } from '$lib/stores';
    import CheckBox from './CheckBox.svelte';
    import ColorPicker from './ColorPicker.svelte';
    import Slider from './Slider.svelte';
    import TextBox from './TextBox.svelte';

    export let right: boolean = false;

</script>

<nav class="side-container{right ? " right" : ""}">

    <p class="title">Settings</p>
    <div class="group">
        <CheckBox
            bind:checked={$isSvgShown}
            >Show SVG</CheckBox>

        <CheckBox
            bind:checked={$svgStrokeSwitch}
            >Stroke</CheckBox>

        <ColorPicker
            bind:value={$svgStroke}
            >SVG stroke color...</ColorPicker>

        <CheckBox
            bind:checked={$svgFillSwitch}
            >Fill</CheckBox>

        <ColorPicker
            bind:value={$svgFill}
            >SVG fill color...</ColorPicker>

        <Slider
            bind:value={$svgAlpha}
            max={255}
            >SVG opacity</Slider>

        <Slider
            bind:value={$cmOpacity}
            max={100}
            >Context menu opacity</Slider>

        <CheckBox
            bind:checked={$isEditing}
            disabled={!$isEditing}
            >Edit mode</CheckBox>

        <CheckBox
            bind:checked={$pointerLockEnabled}
            >Enable pointer lock</CheckBox>

        <Slider
            bind:value={$scrollMultiplier}
            min={0.1}
            max={10}
            >Zoom multiplier</Slider>

        <Slider
            bind:value={$currentFrameId}
            min={Math.min(...$displayFrames.map((f) => f.id))}
            max={Math.max(...$displayFrames.map((f) => f.id))}
            disabled={$isEditing}
            >Frame ID</Slider>

        <Slider
            bind:value={$currentChangeIndex}
            min={-1}
            max={$data.changes.length - 1}
            >Change index</Slider>

        
        <TextBox
            bind:value={$globalColormap}
            >Color map</TextBox>


        <CheckBox
            bind:checked={$sidebarRight}
            >Sidebar on the right</CheckBox>


        <TextBox
            bind:value={$backend_url}
            >Backend url</TextBox>

    </div>

    
</nav>

<style>
    .side-container {
        position: absolute;
        display: flex;
        flex-direction: column;
        width: var(--sidebar-width);
        height: calc(100% - var(--top-bar-height));
        top: var(--top-bar-height);
        left: 0;
        padding: 1.3em;
        border-right: 0.2rem solid var(--accent-color);
        box-sizing: border-box;
    }

    .side-container.right {
        left: auto;
        right: 0;
        border-right: none;
        border-left: 0.2rem solid var(--accent-color);
    }
</style>