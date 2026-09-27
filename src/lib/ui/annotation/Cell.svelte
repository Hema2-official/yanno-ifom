<script lang="ts">
	import { keybindings } from '$lib/states/KeybindingState.svelte';
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
			fill={svgState.svgFillSwitch.current ? svgState.svgFill.current : 'transparent'}
			stroke={selected
				? 'var(--accent-color)'
				: svgState.svgStrokeSwitch.current
					? svgState.svgStroke.current
					: 'none'}
			stroke-width={selected
				? svgState.outlineWidth.current + 1
				: svgState.outlineWidth.current}
		/>
	{/each}
</g>

{#if label !== null && !keybindings.isHeld('display.hideLabels')}
	<text
		x={center.x}
		y={center.y}
		text-anchor="middle"
		dominant-baseline="middle"
		fill="black"
		font-size={svgState.labelSize.current}
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
