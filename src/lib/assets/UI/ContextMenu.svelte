<script lang="ts">
    import { onMount } from "svelte";
    import { cmOpacity, currentFrameId, data, displayFrames, isEditing } from "$lib/stores";
    import { Mouse, isDown } from "$lib/utils/mouse";

    let shown = false;
    let smooth = true;
    let position = { x: 0, y: 0 };
    export let cellId = 0;

    let contextMenuElement: HTMLElement;
    let contextMenuWrapperElement: HTMLElement;

    export const show = (pos: {x: number, y: number}) => {
        const displayBounds = document.querySelector('.display-container').getBoundingClientRect();
        position.x = Math.min(displayBounds.right - contextMenuElement?.offsetWidth, pos.x);
        position.y = Math.min(displayBounds.bottom - contextMenuElement?.offsetHeight, pos.y);
        if (shown) {
            smooth = false;
            shown = false;
            setTimeout(() => {
                smooth = true;
                shown = true;
            }, 5);
        } else {
            shown = true;
        }
        contextMenuElement?.childNodes.forEach(element => {
            (element as HTMLButtonElement).disabled = false;
        });
    }
    export const hide = (smoothly = true) => {
        if (!shown) return;
        if (!smoothly) {
            smooth = false;
            shown = false;
            setTimeout(() => {
                smooth = true;
            }, 5);
        } else {
            shown = false;
        }
        contextMenuElement?.childNodes.forEach(element => {
            (element as HTMLButtonElement).disabled = true;
        });
    }

    const getMinimumHeight = () => {
        const children = contextMenuElement?.children;
        if (!children || children.length === 0) return 0;

        const firstChild = children[0];
        const lastChild = children[children.length - 1];
        const computedStyle = getComputedStyle(contextMenuElement);

        return lastChild.getBoundingClientRect().bottom - firstChild.getBoundingClientRect().top +
            parseFloat(getComputedStyle(lastChild).marginBottom) + parseFloat(getComputedStyle(firstChild).marginTop) +
            parseFloat(computedStyle.borderTopWidth) + parseFloat(computedStyle.borderBottomWidth);
    }

    $: styles = {
        'cm-display': 'flex',
        'cm-top': position.y,
        'cm-left': position.x,
        'cm-opacity': $cmOpacity,
        'cm-transition-duration': smooth ? 0.2 : 0,
        'cm-wrapper-height': shown ? getMinimumHeight() : 0,
    };
    const stylesUnits = {
        'cm-display': '',
        'cm-top': 'px',
        'cm-left': 'px',
        'cm-opacity': '%',
        'cm-transition-duration': 's',
        'cm-wrapper-height': 'px',
    };

    $: cssVarStyles = Object.entries(styles)
        .map(([key, value]) => `--${key}:${value}${stylesUnits[key]}`)
        .join(';');

    document.addEventListener('mousedown', (e: MouseEvent) => {
        if (!shown) return;
        if (!e.target) return;
        let target = e.target as HTMLElement;

        while (target && target != document.body && target != contextMenuWrapperElement) {
            if (target === contextMenuElement) return;
            target = target.parentElement;
        }

        hide(!isDown(Mouse.Secondary, e.buttons));
    });

</script>

<div class="context-menu-wrapper" style="{cssVarStyles}" bind:this={contextMenuWrapperElement}>
<div class="context-menu" bind:this={contextMenuElement}>
    <p>Cell #{cellId}</p>
    <button on:click={() => {isEditing.set(true); hide(false);}}>Edit</button>
    <button on:click={() => {data.update((d) => {
        d.changes.push({
            time: Date.now(),
            frames: [{
                id: $displayFrames[$currentFrameId].id,
                cells: [{ id: cellId, x: null, y: null }]
            }]
        });
        return d;
    })}}>Delete</button>
    <button>HII:3</button>
</div>
</div>

<style>
    .context-menu-wrapper {
        position: absolute;
        top: calc(var(--cm-top) - var(--top-bar-height));
        left: var(--cm-left);
        width: auto;
        max-height: var(--cm-wrapper-height);
        display: flex;
        overflow: hidden;
        z-index: 100;
        pointer-events: none;
        transition: max-height var(--cm-transition-duration) ease-out;
    }

    .context-menu {
        width: 7em;
        min-height: fit-content;
        height: fit-content;
        background-color: var(--background-color);
        /* border-radius: 1em;
        padding-bottom: 0.6em; */
        border: 3px dashed var(--gray-accent);
        display: var(--cm-display);
        opacity: var(--cm-opacity);
        flex-direction: column;
        align-items: start;
        pointer-events: all;
        -moz-user-select: none;
        user-select: none;
    }
</style>