<script lang="ts">
	import type { TrackType } from '$lib/types/annotation.type';
	import { cellBodyToPathCached } from '$lib/utils/display';
	import { getPolygonsBoundsCached } from '$lib/utils/geometry';
	import type { Matrix } from '$lib/utils/layout';
	import { rleToPolygons } from '$lib/utils/rle';

	type Props = {
		cell: TrackType;
		/** Maps the cell's frame into the stage. */
		matrix: Matrix;
	};

	let { cell, matrix }: Props = $props();

	const polygons = $derived(rleToPolygons(cell.SegmentationRLE));
	const box = $derived(getPolygonsBoundsCached(polygons));
	// The svg covers the cell's box only: Firefox repaints a large svg whole
	const placed = $derived.by(() => {
		const [a, b, c, d, e, f] = matrix;
		const { minX, minY } = box;
		return [a, b, c, d, e + a * minX + c * minY, f + b * minX + d * minY];
	});
</script>

<!-- The hovered cell's fill on an svg of its own, leaving the tiles untouched -->
<svg
	class="pointer-events-none absolute top-0 left-0 origin-top-left"
	width={box.maxX - box.minX}
	height={box.maxY - box.minY}
	viewBox="{box.minX} {box.minY} {box.maxX - box.minX} {box.maxY - box.minY}"
	style:transform="matrix({placed.join(', ')})"
>
	{#each polygons as body, index (index)}
		<path d={cellBodyToPathCached(body)} class="fill-border" />
	{/each}
</svg>
