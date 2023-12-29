<script lang="ts">
    import { _ } from 'svelte-i18n';
    import { isSvgShown, svgStroke, svgFill, frames, frameIndex, svgAlpha, svgFillSwitch, svgStrokeSwitch, minScale, maxScale, isEditing } from '../../stores';
    import type { CellType, FrameType } from '../../types';

    import _data from '../../../data/data.json';
    import { onMount } from 'svelte';
    import { scale } from 'svelte/transition';
    import ContextMenu from './ContextMenu.svelte';
    import { Mouse, isDown } from '../../utils';
    import EditorControls from './EditorControls.svelte';

    $frames = _data.frames as FrameType[];
    
    let contextMenuComponent: ContextMenu;

    let editorCell: CellType;
    let testCoords = { x: 0, y: 0 };

    const cellToPath = (cell: CellType) => {
        let path = `M${cell.x[0]},${cell.y[0]} `;
        for (let i = 0; i < cell.x.length; i++) path += `L${cell.x[i]},${cell.y[i]} `;
        path += 'z';
        return path;
    }

    $: styles = {
		'scale-percent': 100,
        'translate-x': 0,
        'translate-y': 0,
        'image-top': 0,
	};
    const stylesUnits = {
        'scale-percent': '%',
        'translate-x': 'px',
        'translate-y': 'px',
        'image-top': 'px',
    };

    $: cssVarStyles = Object.entries(styles)
		.map(([key, value]) => `--${key}:${value}${stylesUnits[key]}`)
		.join(';');

    const getPointerCoords = (e: any) => {
        return { x: e.clientX as number, y: e.clientY as number };
    }

    const movePixels = (x: number, y: number) => {
        const container = document.querySelector('.display-container');
        if (!container) return;
        const scale = styles['scale-percent'] / 100;
        const scaledWidth = container.clientWidth * scale;
        const scaledHeight = container.clientHeight * scale;
        const offsetX = (Math.min(scaledHeight, scaledWidth) - container.clientWidth) / 2;
        const offsetY = (Math.min(scaledHeight, scaledWidth) - container.clientHeight) / 2;
        styles['translate-x'] = scaledHeight >= container.clientWidth ?
            Math.max(-offsetX, Math.min(offsetX, x + styles['translate-x'])) : 0;
        styles['translate-y'] = scaledWidth >= container.clientHeight ?
            Math.max(-offsetY, Math.min(offsetY, y + styles['translate-y'])) : 0;
        styles['image-top'] = -(scaledHeight - container.clientHeight) / 2;
    }

    const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (!e.target) return;

        // check if zooming makes sense
        if (styles['scale-percent'] === $minScale && e.deltaY > 0) return;
        if (styles['scale-percent'] === $maxScale && e.deltaY < 0) return;
        
        // hide context menu
        contextMenuComponent.hide(false);

        // find zoomable element
        let target = e.target as HTMLElement;
        if (target.classList.contains('display-container')) return;
        while (!target?.classList.contains('zoomable'))
            target = target.parentElement;
        if (!target) return;

        // find mouse pos
        const mouse = getPointerCoords(e);
        if (!mouse) return;

        // adjust zoom (the bigger the scale, the faster the zoom)
        const oldScalePercent = styles['scale-percent'];
        styles['scale-percent'] = Math.max($minScale, Math.min($maxScale, styles['scale-percent'] + e.deltaY * -0.001 * oldScalePercent));

        // check if scale changed
        if (oldScalePercent === styles['scale-percent']) return;

        // adjust translate
        const { width, height, top, left } = target.getBoundingClientRect();
        const scaleDiff = (styles['scale-percent'] / 100) / (oldScalePercent / 100) - 1;
        const distanceX = (width / 2 - mouse.x + left) * scaleDiff;
        const distanceY = (height / 2 - mouse.y + top) * scaleDiff;
        movePixels(distanceX, distanceY);
    };

    const prevMouseStats = {
        x: 0,
        y: 0,
        down: false
    };

    const handleMove = (e: any) => {
        if (!e.target || !(isDown(Mouse.Primary, e.buttons) || isDown(Mouse.Secondary, e.buttons))) {
            prevMouseStats.down = false;
            return;
        }

        // find mouse pos
        const mouse = getPointerCoords(e);
        if (!mouse) return;

        // check if zoomed
        if (styles['scale-percent'] === $minScale) return;

        // handle pan
        if (!prevMouseStats.down) {
            prevMouseStats.x = mouse.x;
            prevMouseStats.y = mouse.y;
            prevMouseStats.down = true;
            return;
        }

        // adjust translate
        movePixels(mouse.x - prevMouseStats.x, mouse.y - prevMouseStats.y);

        // update prev stats
        prevMouseStats.x = mouse.x;
        prevMouseStats.y = mouse.y;
    }

    const ignoreContextMenu = (e: any) => {
        e.preventDefault();
    }

    const handleContextMenu = (e: any) => {
        e.preventDefault();
        const cellId = e.target.id.replace('cell', '');
        contextMenuComponent.$set({ cellId: cellId });
        editorCell = $frames[$frameIndex].cells.find(c => c.id == cellId);
        contextMenuComponent.show(getPointerCoords(e));
    }
    
    // let svg = frameToSvg(1);

    const edit = () => {
        contextMenuComponent.hide(false);
        $isEditing = true;
        
        // calculate center of cell
        const x = editorCell.x.reduce((a, b) => a + b) / editorCell.x.length;
        const y = editorCell.y.reduce((a, b) => a + b) / editorCell.y.length;

        //testCoords = { x: x, y: y };


    }

</script>


<div class="display-container"
    role="img"
    on:wheel={handleWheel}
    on:mousemove={handleMove}
    on:contextmenu={ignoreContextMenu}
    style={cssVarStyles}
    >
    
    <div class="image-wrapper">

        <img src="/test.png" alt="" class="zoomable" />
        
        {#if $isSvgShown}
        <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" role="img" class="zoomable" on:contextmenu={ignoreContextMenu}>
            {#if !$isEditing}
            {#each $frames[$frameIndex].cells as cell}
            <g on:contextmenu={handleContextMenu} role="region">
                <path
                    id="cell{cell.id}"
                    d={cellToPath(cell)}
                    fill={$svgFillSwitch ? $svgFill : 'transparent'}
                    stroke={$svgStrokeSwitch ? $svgStroke : 'none'}
                    stroke-width="2px"
                    opacity={$svgAlpha / 255}
                    role="img"
                    />
                    <!-- If I ever remove the grouping, remember to also change the target in handleWheel accordingly! -->
            </g>
            {/each }
            {:else}
                <g>
                    <path
                        id="cell{editorCell.id}"
                        d={cellToPath(editorCell)}
                        fill={$svgFillSwitch ? $svgFill : 'transparent'}
                        stroke={$svgStrokeSwitch ? $svgStroke : 'none'}
                        stroke-width="2px"
                        opacity={$svgAlpha / 255}
                        role="img"
                        />
                </g>
                <!-- Draw point at testCoords -->
                <circle cx={testCoords.x} cy={testCoords.y} r="1" fill="red" />

                <!-- convert editorCell.x and editorCell.y to array of tuples and iterate through them -->
                {#each editorCell.x as _, i}
                    {@const halfSize = 1 / styles['scale-percent'] * 200}
                    <rect id="hdl{i}"
                        x={editorCell.x[i] - halfSize}
                        y={editorCell.y[i] - halfSize}
                        width="{halfSize * 2}"
                        height="{halfSize * 2}"
                        fill="pink"
                        stroke="black"
                        stroke-width="{halfSize / 3}"
                        />
                {/each}
            {/if}
        </svg>
        {/if}
        
    </div>

    {#if $isEditing}
        <EditorControls>
            <div>
                <button>Some</button>
                <div>
                    <button>G1</button>
                    <button>G2</button>
                    <button>G3</button>
                </div>
                <button>X</button>
                <button>Y</button>
            </div>
            <div class="right">
                <button on:click={() => $isEditing = false} title={$_("confirm_and_quit")}>Done</button>
                <button title={$_("quit_without_saving")}>Some</button>
                <div>
                    <button>G1</button>
                    <button>G2</button>
                    <button>G3</button>
                </div>
                <button>X</button>
                <button>Y</button>
            </div>
        </EditorControls>
    {:else}
    
    {/if}
    <ContextMenu bind:this={contextMenuComponent} on:mousemove={null}>
        <button on:click={edit}>Edit</button>
        <button>Something</button>
        <button>HII:3</button>
    </ContextMenu>

</div>

<style>
    .display-container {
        position: relative;
        display: flex;
        flex-direction: row;
        align-items: center;
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
        background-color: var(--empty-background-color);
        overflow: hidden;
    }

    .image-wrapper {
        position: absolute;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
        cursor: grab;
    }

    .image-wrapper:active {
        cursor: grabbing;
    }

    .zoomable {
        top: var(--image-top);
        position: absolute;
        object-fit: contain;
        width: 100%;
        height: 100%;
        height: var(--scale-percent);
        width: var(--scale-percent);
        transform: translate(var(--translate-x), var(--translate-y));
        transform-origin: center;
        transition: transform 100ms cubic-bezier(0.1, 1, 0.1, 1), width 100ms cubic-bezier(0.1, 1, 0.1, 1), height 100ms cubic-bezier(0.1, 1, 0.1, 1), top 100ms cubic-bezier(0.1, 1, 0.1, 1);
    }

    path {
        cursor: context-menu;
    }

    path:hover {
        fill: #ff0000;
    }
</style>