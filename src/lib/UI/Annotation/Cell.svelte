<script lang="ts">
	import { modifierKeys } from '$lib/stores/input';
	import { svgFill, svgFillSwitch, svgStroke, svgStrokeSwitch } from '$lib/stores/svg';
	import type { NewCellType } from '$lib/types/annotation.type';
	import { cellBodyToPath } from '$lib/utils/display';
	import type { Polygon } from '$lib/utils/geometry';

	let { cell }: { cell: NewCellType } = $props();

	let center: { x: number; y: number } | undefined = $derived(
		cell.bodies.length > 0
			? {
					x:
						(Math.min(...cell.bodies.map((body) => Math.min(...body.x))) +
							Math.max(...cell.bodies.map((body) => Math.max(...body.x)))) /
						2,
					y:
						(Math.min(...cell.bodies.map((body) => Math.min(...body.y))) +
							Math.max(...cell.bodies.map((body) => Math.max(...body.y)))) /
						2
				}
			: undefined
	);
</script>

<g id="cell{cell.id}">
	{#each cell.bodies ?? [] as body, index}
		<path
			id="cell{cell.id}-body{index}"
			d={cellBodyToPath(body as unknown as Polygon)}
			fill={$svgFillSwitch ? $svgFill : 'transparent'}
			stroke={$svgStrokeSwitch ? $svgStroke : 'none'}
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

{#if center && !$modifierKeys.shift}
	<text
		x={center.x}
		y={center.y}
		text-anchor="middle"
		dominant-baseline="middle"
		fill="black"
		font-size="12px"
		font-weight="bold">{cell.id}</text
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
