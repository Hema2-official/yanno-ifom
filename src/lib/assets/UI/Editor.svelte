<script lang="ts">
    import { svgAlpha, svgFill, svgFillSwitch, svgStroke, svgStrokeSwitch } from "$lib/stores";
    import type { CellType } from "$lib/types";
    import { cellToPath, getPointerViewBoxCoords } from "$lib/utils/display";
    import { Mouse, isDown, isUp } from "$lib/utils/mouse";

    export let cell: CellType;
    export let svgElement: SVGSVGElement;
    export let svgScalePercent: number;
    export let imageMouse: {
        prevX: number; prevY: number; down: boolean; first: boolean;
        setPos: (pos: { x: number; y: number; }) => void;
        mouseDown: (e: MouseEvent) => void; mouseUp: (e: MouseEvent) => any;
        mouseMove: (e: MouseEvent) => any; mouseMoveLocked: (e: MouseEvent) => void;
    };

    


    export const mouse = {
        down: false,
        handleId: 0,
        mouseDown: (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (isUp(Mouse.Primary, e.buttons)) return;
            mouse.handleId = parseInt((e.target as HTMLElement).id.replace('hdl', ''));
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
            if (!mouse.down) return;

            // find mouse pos in viewBox coords
            const mouseViewBox = getPointerViewBoxCoords(e, svgElement);

            // set handle pos
            cell.x[mouse.handleId] = mouseViewBox.x;
            cell.y[mouse.handleId] = mouseViewBox.y;
        }
    };

</script>

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
</g>

<g role="presentation"
                on:mousedown={mouse.mouseDown}
                on:mouseup={mouse.mouseUp}
                on:mousemove={mouse.mouseMove}
                >
                {#each cell.x as _, i}
                    {@const halfSize = 1 / svgScalePercent * 200}
                    <rect id="hdl{i}"
                        x={cell.x[i] - halfSize}
                        y={cell.y[i] - halfSize}
                        width={halfSize * 2}
                        height={halfSize * 2}
                        fill="pink"
                        stroke="black"
                        stroke-width={halfSize / 3}
                        />
                {/each}
                </g>

<style>
    rect {
        cursor: crosshair;
    }
</style>