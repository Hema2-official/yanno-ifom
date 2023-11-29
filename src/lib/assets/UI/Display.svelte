<script lang="ts">
    import { isSvgShown, svgStroke, svgFill, frames, frameIndex, svgAlpha, svgFillSwitch, svgStrokeSwitch, minScale, maxScale } from '../../stores';
    import type { CellType, FrameType } from '../../types';

    import _data from '../../../data/data.json';
    import { onMount } from 'svelte';
    import { scale } from 'svelte/transition';
    import ContextMenu from './ContextMenu.svelte';

    $frames = _data.frames as FrameType[];

    const cellToPath = (cell: CellType) => {
        let path = `M${cell.x[0]},${cell.y[0]} `;
        for (let i = 0; i < cell.x.length; i++) path += `L${cell.x[i]},${cell.y[i]} `;
        path += 'z';
        return path;
    }

    let styles = {
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
        return { x: e.clientX, y: e.clientY };
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
        
        // find svg element
        let target = e.target as HTMLElement;
        if (target.classList.contains('display-container')) return;
        while (!target.nodeName.toLowerCase().includes('svg'))
            target = target.parentElement;

        // find mouse pos
        const mouse = getPointerCoords(e);
        if (!mouse) return;

        // adjust zoom (the bigger the scale, the faster the zoom)
        const oldScalePercent = styles['scale-percent'];
        styles['scale-percent'] = Math.max($minScale, Math.min($maxScale, styles['scale-percent'] + e.deltaY * -0.001 * oldScalePercent));

        // check if scale changed
        if (oldScalePercent === styles['scale-percent']) return;

        // adjust translate
        const { width, height, top, left, bottom } = target.getBoundingClientRect();
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
        if (!e.target || e.buttons !== 2) {
            prevMouseStats.down = false;
            return;
        }

        // find mouse pos
        const mouse = getPointerCoords(e);
        if (!mouse) return;

        // check if zoomed
        if (styles['scale-percent'] === 100) return;

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

    let isContextMenuShown = false;
    let cmPosition = { x: 0, y: 0 };
    let cmText = '';

    const handleContextMenu = (e: any) => {
        console.log(e);
        isContextMenuShown = true;
        cmPosition = getPointerCoords(e);
        cmText = e.target.id;
        e.preventDefault();
    }
    
    // let svg = frameToSvg(1);


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
        
        <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" role="img" class="zoomable" on:contextmenu={ignoreContextMenu}>
            {#if $isSvgShown}
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
            {/if}
        </svg>
        
    </div>

    <ContextMenu
        shown={isContextMenuShown}
        position={cmPosition}>
        <p>{cmText}</p>
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
        background-color: #1a1a1a;
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
        transition: transform 0.1s cubic-bezier(0.1, 1, 0.1, 1), width 0.1s cubic-bezier(0.1, 1, 0.1, 1), height 0.1s cubic-bezier(0.1, 1, 0.1, 1), top 0.1s cubic-bezier(0.1, 1, 0.1, 1);
    }

    path:hover {
        fill: #ff0000;
    }
</style>