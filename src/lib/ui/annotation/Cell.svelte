<script lang="ts">
	import { inputState } from '$lib/states/InputState.svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import { cellBodyToPathCached } from '$lib/utils/display';
	import { getCenterOfPolygonsCached } from '$lib/utils/geometry';
	import type { Polygon } from '$lib/types/geometry.type';

	type Props = {
		cellPolygons: Polygon[];
		cellId: string;
		label: string | null;
		selected?: boolean;
	};

	let { cellPolygons, cellId, label, selected = false }: Props = $props();

	const center = $derived(getCenterOfPolygonsCached(cellPolygons));
</script>

<g data-cell-id={cellId}>
	{#each cellPolygons as body, index (index)}
		<path
			d={cellBodyToPathCached(body)}
			fill={svgState.svgFillSwitch ? svgState.svgFill : 'transparent'}
			stroke={selected
				? 'var(--accent-color)'
				: svgState.svgStrokeSwitch
					? svgState.svgStroke
					: 'none'}
			stroke-width={selected ? '3px' : '2px'}
		/>
	{/each}
</g>

<!-- TODO: centralize this too | Hold Shift to hide the labels -->
{#if label !== null && !inputState.pressedKeys.has('Shift')}
	<text
		x={center.x}
		y={center.y}
		text-anchor="middle"
		dominant-baseline="middle"
		fill="black"
		font-size="12px"
		font-weight="bold">{label}</text
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
