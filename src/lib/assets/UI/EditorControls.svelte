<script lang="ts">
    import { onMount } from "svelte";
    import { cmOpacity } from "$lib/stores";
    import { Mouse, isDown } from "$lib/utils/mouse";
    import Editor from "./Editor.svelte";

    let contextMenuElement: HTMLElement;
    let editorControlsWrapperElement: HTMLElement;

    export let editorComponent: Editor;

    $: styles = {
	};
    const stylesUnits = {
    };

    $: cssVarStyles = Object.entries(styles)
		.map(([key, value]) => `--${key}:${value}${stylesUnits[key]}`)
		.join(';');
</script>

<div class="editor-controls-wrapper"
    style="{cssVarStyles}"
    role="presentation"
    on:mouseup={editorComponent.mouse.mouseUp}
    bind:this={editorControlsWrapperElement}>
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