<script lang="ts">
	import { pressedKeys } from '$lib/stores/input';
	import { svgState } from '$lib/states/svg.svelte';
	import { cellBodyToPathCached } from '$lib/utils/display';
	import { getCenterOfPolygonsCached } from '$lib/utils/geometry';
	import type { MouseEventHandler } from 'svelte/elements';
	import type { Point, Polygon } from '$lib/types/geometry.type';

	type Props = {
		cellPolygons: Polygon[];
		cellId: string;
		onContextMenu: MouseEventHandler<SVGElement>;
	};

	let { cellPolygons, cellId, onContextMenu }: Props = $props();

	let center: Point = $derived(getCenterOfPolygonsCached(cellPolygons));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<g id="cell{cellId}" oncontextmenu={onContextMenu}>
	{#each cellPolygons ?? [] as body, index (index)}
		<path
			id="cell{cellId}-body{index}"
			d={cellBodyToPathCached(body)}
			fill={svgState.svgFillSwitch ? svgState.svgFill : 'transparent'}
			stroke={svgState.svgStrokeSwitch ? svgState.svgStroke : 'none'}
			stroke-width="2px"
		/>
	{/each}
	<!-- <path
		d={cellToPath(cell)}
		fill={$svgFillSwitch ? $svgFill : 'transparent'}
		stroke={$svgStrokeSwitch ? $svgStroke : 'none'}
		stroke-width="2px"
	/> -->
</g>

{#if !pressedKeys.has('Shift')}
	<text
		x={center.x}
		y={center.y}
		text-anchor="middle"
		dominant-baseline="middle"
		fill="black"
		font-size="12px"
		font-weight="bold">{cellId}</text
	>
{/if}

<style lang="scss">
	path {
		cursor: default;

		&:hover {
			fill: #ff0000;
		}
	}

	text {
		pointer-events: none;
		paint-order: stroke;
		stroke: #ffffff;
		stroke-width: 0.6px;
		stroke-linecap: butt;
		stroke-linejoin: miter;
	}
</style>
