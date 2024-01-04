<script lang="ts">
    import { onMount } from "svelte";
    import { cmOpacity } from "$lib/stores";
    import { Mouse, isDown } from "$lib/utils/mouse";

    let contextMenuElement: HTMLElement;
    let editorControlsWrapperElement: HTMLElement;

    $: styles = {
	};
    const stylesUnits = {
    };

    $: cssVarStyles = Object.entries(styles)
		.map(([key, value]) => `--${key}:${value}${stylesUnits[key]}`)
		.join(';');
</script>

<div class="editor-controls-wrapper" style="{cssVarStyles}" bind:this={editorControlsWrapperElement}>
    <slot />
</div>  

<style>
    .editor-controls-wrapper {
        position: absolute;
        display: block;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 100;
        pointer-events: none;
    }

</style>