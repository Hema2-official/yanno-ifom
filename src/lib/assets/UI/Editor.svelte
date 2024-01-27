<script lang="ts">
    import { lastPointerViewBoxCoords } from "$lib/stores";
    import { EditorMode, type CellType } from "$lib/types";
    import { deepCopy } from "$lib/utils/data";
    import { cellToPath, getPointerViewBoxCoords } from "$lib/utils/display";
    import { Mouse, isDown, isUp } from "$lib/utils/mouse";
    import { onMount } from "svelte";

    export let inputCell: CellType;
    let cell: CellType;
    export let svgElement: SVGSVGElement;
    export let svgScalePercent: number;
    export let imageMouse: {
        prevX: number; prevY: number; down: boolean; first: boolean;
        setPos: (pos: { x: number; y: number; }) => void;
        mouseDown: (e: MouseEvent) => void; mouseUp: (e: MouseEvent) => any;
        mouseMove: (e: MouseEvent) => any; mouseMoveLocked: (e: MouseEvent) => void;
    };
    export let editorMode: EditorMode = EditorMode.Point;
    export let hoverElementsShown: boolean = true;
     
    let testCoords = { x: 0, y: 0 };

    const smoothRadius = 10;
    let relations: { index: number; coeff: { x: number, y: number }; startingPos: { x: number, y: number } }[] = [];
    let centerPoint = { x: 0, y: 0 };
    let wholeMode = { x: 0, y: 0, rotating: false, moving: false };

    export const mouse = {
        down: false,
        cellID: 0,
        handleID: 0,
        startingPos: { x: 0, y: 0 },
        mouseDown: (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (isUp(Mouse.Primary, e.buttons)) return;
            switch (editorMode) {
                case EditorMode.Point:
                    [ mouse.cellID, mouse.handleID ] = (e.target as HTMLElement).id.replace('hdl', '').split('_').map(x => parseInt(x));
                    break;
                
                case EditorMode.Whole:
                    const splitID = (e.target as HTMLElement).id.replace('hdl', '').split('_');
                    mouse.cellID = parseInt(splitID[0]);
                    if (splitID[1] === 'r') { 
                        mouse.startingPos = getPointerViewBoxCoords(e, svgElement);
                        centerPoint = { x: (Math.min(...cell.x) + Math.max(...cell.x)) / 2, y: (Math.min(...cell.y) + Math.max(...cell.y)) / 2 };
                        relations = cell.x.map((x, i) => {
                            const dx = x - centerPoint.x, dy = cell.y[i] - centerPoint.y;
                            const dist = Math.sqrt(dx * dx + dy * dy), angle = Math.atan2(dy, dx);
                            return { index: i, coeff: { x: dist, y: angle }, startingPos: { x: 0, y: 0 } };
                        });
                        wholeMode.rotating = true;
                        break;
                    }
                    if (splitID[1] === 'm') {
                        mouse.startingPos = getPointerViewBoxCoords(e, svgElement);
                        relations = cell.x.map((x, i) => ({ index: i, coeff: { x: 1, y: 1 }, startingPos: { x, y: cell.y[i] } }));
                        wholeMode.moving = true;
                        break;
                    }
                    wholeMode.rotating = wholeMode.moving = false;
                    const minX = Math.min(...cell.x), minY = Math.min(...cell.y), maxX = Math.max(...cell.x), maxY = Math.max(...cell.y);
                    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2, width = maxX - minX, height = maxY - minY;
                    [ wholeMode.x, wholeMode.y ] = splitID[1].split(':').map(x => parseInt(x));
                    mouse.startingPos = { x: wholeMode.x === 0 ? midX : (wholeMode.x === -1 ? minX : maxX),
                        y: wholeMode.y === 0 ? midY : (wholeMode.y === -1 ? minY : maxY) };
                    relations = cell.x.map((x, i) => ({ index: i, coeff: {
                        x: wholeMode.x !== 0 ? (x - mouse.startingPos.x) / width * wholeMode.x + 1 : 0,
                        y: wholeMode.y !== 0 ? (cell.y[i] - mouse.startingPos.y) / height * wholeMode.y + 1 : 0 },
                        startingPos: { x, y: cell.y[i] } }));
                    break;
                                       
                case EditorMode.Smooth:
                    mouse.startingPos = getPointerViewBoxCoords(e, svgElement);
                    relations = [];
                    cell.x.forEach((x, i) => {
                        const dx = x - mouse.startingPos.x;
                        const dy = cell.y[i] - mouse.startingPos.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const co = 1 - dist / smoothRadius;
                        if (dist < smoothRadius) relations.push({ index: i, coeff: { x: co, y: co }, startingPos: { x: x, y: cell.y[i] } });
                    });
                    break;
            }
            mouse.down = true;
        },
        mouseUp: (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (imageMouse.down) return imageMouse.mouseUp(e);
            if (isDown(Mouse.Primary, e.buttons)) return;
            mouse.down = false;
        },
        mouseMove: (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Update viewbox coord values (needed for smooth mode)
            const mouseViewBox = getPointerViewBoxCoords(e, svgElement);

            if (imageMouse.down) return imageMouse.mouseMove(e);
            if (!mouse.down) return;

            switch (editorMode) {
                case EditorMode.Point:
                    // set handle pos
                    cell.x[mouse.handleID] = mouseViewBox.x;
                    cell.y[mouse.handleID] = mouseViewBox.y;
                    break;
                case EditorMode.Whole:
                    if (wholeMode.rotating) {
                        // Calculate the angle between the starting pos and the current mouse pos with the center of the cell as the origin
                        const angle = Math.atan2(mouseViewBox.y - centerPoint.y, mouseViewBox.x - centerPoint.x) -
                            Math.atan2(mouse.startingPos.y - centerPoint.y, mouse.startingPos.x - centerPoint.x);
                        // Rotate each handle around the center of the cell relative to their starting pos
                        relations.forEach(({ index, coeff }) => {
                            // coeff.x = distance from center of cell to point, coeff.y = angle between center of cell and point
                            const angle2 = coeff.y + angle;
                            cell.x[index] = centerPoint.x + Math.cos(angle2) * coeff.x;
                            cell.y[index] = centerPoint.y + Math.sin(angle2) * coeff.x;
                        });
                        break;
                    }
                    // fall through to the next case, the code is the same for moving and resizing
                case EditorMode.Smooth:
                    // adjust each handle's position based on their starting pos and their coeff*mouse movement
                    relations.forEach(({ index, coeff, startingPos }) => {
                        cell.x[index] = startingPos.x + (mouseViewBox.x - mouse.startingPos.x) * coeff.x;
                        cell.y[index] = startingPos.y + (mouseViewBox.y - mouse.startingPos.y) * coeff.y;
                    });
                    break;
            }
        }
    };

    cell = deepCopy(inputCell);
    // onMount(() => {
    //     cell = deepCopy(inputCell);
    //     if (cell.x.length === 0) {
    //         cell.x = [0, 1, 2, 3, 4, 5];
    //         cell.y = [0, 1, 2, 3, 4, 5];
    //     }
    // });

</script>

<defs>
    <radialGradient id="maskRadialGradient">
        <stop offset="0%" stop-color="white" />
        <stop offset="100%" stop-color="black" />
    </radialGradient>
    <radialGradient id="handleRadialGradient" spreadMethod="reflect">
        <stop offset="25%" stop-color="white" stop-opacity=0 />
        <stop offset="100%" stop-color="white" stop-opacity=0.4 />
    </radialGradient>
</defs>
<mask id="pointerMaskCircle">
    <circle cx={$lastPointerViewBoxCoords.x} cy={$lastPointerViewBoxCoords.y} r={smoothRadius} fill="url('#maskRadialGradient')" ></circle>
</mask>

<!-- Non-interactive elements -->
{#if editorMode === EditorMode.Point}

    <path
        id="cell{cell.id}"
        d={cellToPath(cell)}
        fill="none"
        stroke="black"
        stroke-width="2px"
        opacity=1
        />

{:else if editorMode === EditorMode.Whole}

    <path
        id="cell{cell.id}"
        d={cellToPath(cell)}
        fill="none"
        stroke="black"
        stroke-width=1
        stroke-dasharray="3, 2"
        opacity=0.5
        />

{/if}
                
<!-- Draw point at testCoords -->


<!-- Interactive elements -->
<g role="presentation"
on:mousedown={mouse.mouseDown}
on:mouseup={mouse.mouseUp}
on:mousemove={mouse.mouseMove}
>
    {#if editorMode === EditorMode.Point}

        {#each cell.x as _, i}
        {@const halfSize = 200 / svgScalePercent}
        <rect id="hdl{cell.id}_{i}"
            x={cell.x[i] - halfSize}
            y={cell.y[i] - halfSize}
            width={halfSize * 2}
            height={halfSize * 2}
            fill="pink"
            stroke="black"
            stroke-width={halfSize / 3}
            cursor="crosshair"
            />
        {/each}

    {:else if editorMode === EditorMode.Whole}

        {@const minX = Math.min(...cell.x)} {@const minY = Math.min(...cell.y)}
        {@const maxX = Math.max(...cell.x)} {@const maxY = Math.max(...cell.y)}
        {@const midX = (minX + maxX) / 2}
        {@const handleBarColor = "gray"} {@const handleColor = "white"}
        {@const size = 400 / svgScalePercent}

        <rect id="hdl{cell.id}_m" class="whole" x={minX} y={minY} width={maxX - minX} height={maxY - minY} fill="transparent" stroke="none" cursor="move" />
        {#if !mouse.down}
            <circle cx={testCoords.x} cy={testCoords.y} r="1" fill="red" />
            <path id="hdl{cell.id}_r" class="whole" d={`M${midX-(size*2)},${minY-2} Q${midX} ${minY-2-size},${midX+(size*2)} ${minY-2}`}
                fill="transparent" stroke={handleColor} stroke-width={size*2} stroke-linecap="round" cursor="ew-resize" /> <!-- rotate -->
        {/if}
        {#if (mouse.down && !wholeMode.rotating && !wholeMode.moving) || !mouse.down}
            <line id="hdl{cell.id}_0:-1" class="whole" x1={minX} y1={minY} x2={maxX} y2={minY} stroke={handleBarColor} stroke-width={size} cursor="ns-resize" /> <!-- top -->
            <line id="hdl{cell.id}_0:1" class="whole" x1={minX} y1={maxY} x2={maxX} y2={maxY} stroke={handleBarColor} stroke-width={size} cursor="ns-resize" /> <!-- bottom -->
            <line id="hdl{cell.id}_-1:0" class="whole" x1={minX} y1={minY} x2={minX} y2={maxY} stroke={handleBarColor} stroke-width={size} cursor="ew-resize" /> <!-- left -->
            <line id="hdl{cell.id}_1:0" class="whole" x1={maxX} y1={minY} x2={maxX} y2={maxY} stroke={handleBarColor} stroke-width={size} cursor="ew-resize" /> <!-- right -->

            <rect id="hdl{cell.id}_-1:-1" class="whole" x={minX-size} y={minY-size} width={size*2} height={size*2} fill={handleColor} cursor="nwse-resize" /> <!-- top left -->
            <rect id="hdl{cell.id}_1:-1" class="whole" x={maxX-size} y={minY-size} width={size*2} height={size*2} fill={handleColor} cursor="nesw-resize" /> <!-- top right -->
            <rect id="hdl{cell.id}_-1:1" class="whole" x={minX-size} y={maxY-size} width={size*2} height={size*2} fill={handleColor} cursor="nesw-resize" /> <!-- bottom left -->
            <rect id="hdl{cell.id}_1:1" class="whole" x={maxX-size} y={maxY-size} width={size*2} height={size*2} fill={handleColor} cursor="nwse-resize" /> <!-- bottom right -->
        {/if}

    {:else if editorMode === EditorMode.Smooth}

        <path
            d={cellToPath(cell)}
            fill='none'
            stroke="url('#handleRadialGradient')"
            stroke-width={smoothRadius * 2}
            opacity=1
            cursor="move"
            />
        <path
            class="smooth"
            d={cellToPath(cell)}
            fill='none'
            stroke='black'
            stroke-width=2
            opacity=0.6
            />

    {/if}
    
</g>

<!-- Non-interactive elements on top -->
{#if editorMode === EditorMode.Smooth && hoverElementsShown}

    <g mask="url(#pointerMaskCircle)">
        {#each cell.x as _, i}
        {@const halfSize = 0.25}
        <path
            class="smooth"
            d={`M${cell.x[i] - halfSize},${cell.y[i] - halfSize} L${cell.x[i] + halfSize},${cell.y[i] + halfSize
            } M${cell.x[i] + halfSize},${cell.y[i] - halfSize} L${cell.x[i] - halfSize},${cell.y[i] + halfSize}`}
            stroke="white"
            stroke-width={halfSize / 1.5}
            />
        {/each}
    </g>
    
{/if}

<style>
    .smooth {
        cursor: move;
        pointer-events: none;
    }
</style>