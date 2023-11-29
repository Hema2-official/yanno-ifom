<script lang="ts">
    import { isSvgShown, svgStroke, svgFill, frames, frameIndex, svgAlpha, svgFillSwitch, svgStrokeSwitch, minScale, maxScale } from '../../stores';
    import type { CellType, FrameType } from '../../types';

    import _data from '../../../data/data.json';
    import { onMount } from 'svelte';
    import { scale } from 'svelte/transition';
    import 'zoomist/css'
    import Zoomist from 'zoomist'

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
	};
    const stylesUnits = {
        'scale-percent': '%',
        'translate-x': 'px',
        'translate-y': 'px',
    };

    $: cssVarStyles = Object.entries(styles)
		.map(([key, value]) => `--${key}:${value}${stylesUnits[key]}`)
		.join(';');

    const getAbsCoords = (e: any) => {
        // let target: HTMLElement = e.target;
        // while (!target.classList.contains('display-container'))
        //     target = target.parentElement;
        // const shorterSide = Math.min(target.clientWidth, target.clientHeight);
        return { x: e.clientX, y: e.clientY };
    }
    
    const getRelativeCoords = (e: any) => {
        const shorterSide = Math.min(e.target.clientWidth, e.target.clientHeight);
        const offsetX = Math.round((e.target.clientWidth - shorterSide) / 2);
        const offsetY = Math.round((e.target.clientHeight - shorterSide) / 2);
        const mouseX = e.layerX - offsetX;
        const mouseY = e.layerY - offsetY;
        return { x: mouseX, y: mouseY, size: shorterSide };
    }

    const getRelativeCoordsNew = (e: any) => {
        return { x: e.layerX, y: e.layerY };
    }

    function calculateShift(originalSize: number, scale: number, transformOrigin: number) {
        return originalSize * scale / 2 - transformOrigin * (scale);
    }

    const movePixels = (x: number, y: number) => {
        const container = document.querySelector('.display-container');
        if (!container) return;
        const scale = styles['scale-percent'] / 100;
        const scaledWidth = container.clientWidth * scale;
        const scaledHeight = container.clientHeight * scale;
        const offsetX = (Math.min(scaledHeight, scaledWidth) - container.clientWidth) / 2;
        const offsetY = scaledHeight > scaledWidth ? Math.abs(scaledWidth - scaledHeight) / 2 : 0;
        styles['translate-x'] = scaledHeight >= container.clientWidth ?
            Math.max(-offsetX, Math.min(offsetX, x + styles['translate-x'])) : 0;
        styles['translate-y'] = scaledWidth >= container.clientHeight ?
            Math.max(-(scaledHeight - container.clientHeight) + offsetY, Math.min(-offsetY, y + styles['translate-y'])) : -(scaledHeight - container.clientHeight) / 2;
    }

    const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (!e.target) return;
        
        // find mouse pos
        const mouse = getRelativeCoordsNew(e);
        const mouseAbs = getAbsCoords(e);
        if (!mouse || !mouseAbs) return;

        // adjust zoom (the bigger the scale, the faster the zoom)
        const delta = e.deltaY;
        const oldScalePercent = styles['scale-percent'];
        styles['scale-percent'] = Math.max($minScale, Math.min($maxScale, styles['scale-percent'] + delta * -0.001 * oldScalePercent));

        // find svg element
        // let target = e.target as Element;
        // if (target.classList.contains('display-container')) return;
        // while (!target.nodeName.toLowerCase().includes('svg'))
        //     target = target.parentElement;

        // check if scale changed
        if (oldScalePercent === styles['scale-percent']) return;

        // find container
        const container = document.querySelector('.display-container');
        if (!container) return;
        
        const scaleChange = styles['scale-percent'] / oldScalePercent;
        const scaledHeight = container.clientHeight * styles['scale-percent'] / 100;
        const scaledWidth = container.clientWidth * styles['scale-percent'] / 100;
        const maxY = -(scaledHeight - container.clientHeight);
        const offsetX = (Math.min(scaledHeight, scaledWidth) - container.clientWidth) / 2;
        const mousePercentX = mouse.x / scaledWidth;
        const mousePercentY = mouse.y / scaledHeight;
        const mouseAbsPercentX = mouseAbs.x / container.clientWidth;
        const mouseAbsPercentY = mouseAbs.y / container.clientHeight;
        console.debug(mouseAbs.x - container.clientWidth / 2);
        movePixels(calculateShift(container.clientWidth, styles['scale-percent'] / 100, mouseAbs.x - container.clientWidth) - styles['translate-x'], 0); //maxY * mousePercentY * scaleChange - styles['translate-y'] + container.clientHeight - mouseAbsPercentY * container.clientHeight);
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
        const mouse = getAbsCoords(e);
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

    const handleContextMenu = (e: any) => {
        e.preventDefault();
    }

    onMount(() => {
        const zoomist = new Zoomist('.zoomist-container', {
            // Optional parameters
            maxScale: 4,
            bounds: true,
            // if you need slider
            slider: true,
            // if you need zoomer
            zoomer: true,
            zoomRatio: 0.3,
        });
    });
    
    // let svg = frameToSvg(1);

</script>

<div class="display-container zoomist-container"
    role="img"
    on:mousemove={handleMove}
    on:contextmenu={handleContextMenu}
    style={cssVarStyles}
    >

    <div class="zoomist-wrapper">
    <div class="zoomist-image">
    
        <img src="/test.png" alt="" class="zoomable" /> <!--zoomable-->
        
        <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" role="img" class="zoomable" on:contextmenu={handleContextMenu}> <!--zoomable-->
            {#if $isSvgShown}
                {#each $frames[$frameIndex].cells as cell}
                    <g>
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
    </div>
    
</div>

<style>
    :root {
        --zoomist-wrapper-bg-color: unset !important;
    }

    .display-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
        background-color: #1a1a1a;
        overflow: hidden;
    }

    .zoomable {
        position: absolute;
        object-fit: contain;
        width: 100%;
        height: 100%;
        /* height: var(--scale-percent);
        width: var(--scale-percent);
        transform: translate(var(--translate-x), var(--translate-y));
        transform-origin: center;
        transition: transform 0.1s cubic-bezier(0.1, 1, 0.1, 1), width 0.1s cubic-bezier(0.1, 1, 0.1, 1), height 0.1s cubic-bezier(0.1, 1, 0.1, 1); */
    }

    .zoomist-image {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        height: 100%;
        aspect-ratio: 1;
        transition: --scale 0.1s cubic-bezier(0.1, 1, 0.1, 1);
    }

    path:hover {
        fill: #ff0000;
    }
</style>