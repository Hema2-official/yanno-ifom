<script lang="ts">
    import { _ } from "svelte-i18n";
    import Editor from "./Editor.svelte";
    import { EditorMode } from "$lib/types";

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

        
    function radioSelect(e: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement; }) {
        e.currentTarget.classList.add('selected');
        const siblings = e.currentTarget.parentElement?.children;
        if (siblings)
            for (const sibling of siblings)
                if (sibling !== e.currentTarget) sibling.classList.remove('selected');
    }

</script>

<div class="editor-controls-wrapper"
    style="{cssVarStyles}"
    role="presentation"
    on:mouseup={editorComponent.mouse.mouseUp}
    bind:this={editorControlsWrapperElement}>
    <div>
        <div>
            <button title={$_("point_tool")} class="selected"
                on:click={(e) => {radioSelect(e);
                editorComponent.$set( {editorMode: EditorMode.Point} )}}
                >P</button>
            <button title={$_("whole_tool")}
                on:click={(e) => {radioSelect(e);
                editorComponent.$set( {editorMode: EditorMode.Whole} )}}
                >W</button>
            <button title={$_("smooth_tool")}
                on:click={(e) => {radioSelect(e);
                editorComponent.$set( {editorMode: EditorMode.Smooth} )}}
                >S</button>
        </div>
    </div>
    <div class="right">
        <button on:click={() => editorComponent.quit(true)} title={$_("confirm_and_quit")}>Save</button>
        <button on:click={() => editorComponent.quit(false)} title={$_("quit_without_saving")}>Nope</button>
    </div>
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
