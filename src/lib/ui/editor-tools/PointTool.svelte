<script lang="ts">
	import { zoomState } from '$lib/states/zoom.svelte';
	import { getPointerViewBoxCoords } from '$lib/utils/display';
	import { startDrag } from '$lib/utils/drag';
	import { WorkingCell, commitWorking, dropWorking, outlinesOf } from './working.svelte';
	import type { EditorToolProps } from './types';
	import { onDestroy } from 'svelte';

	let { cells }: EditorToolProps = $props();

	let root: SVGGElement | undefined = $state();

	// The dragged cell's private copy, only during a gesture
	let working: WorkingCell | null = $state.raw(null);
	let handle = { body: 0, point: 0 };

	const shown = $derived(working ? [working] : outlinesOf(cells));
	const halfSize = $derived(2 * zoomState.screenUnit);

	function handlePointerDown(e: PointerEvent) {
		if (e.button !== 0 || !root) return;
		const { cell: index, body, point } = (e.target as SVGElement).dataset;
		const cell = index === undefined ? undefined : cells[Number(index)];
		if (!cell) return;

		e.preventDefault();
		e.stopPropagation();
		if (!startDrag(root, e, { onMove: handleDragMove, onEnd: handleDragEnd })) return;

		handle = { body: Number(body), point: Number(point) };
		working = new WorkingCell(cell, { resample: false });
	}

	function handleDragMove(e: PointerEvent) {
		if (!working || !root?.ownerSVGElement) return;
		const { x, y } = getPointerViewBoxCoords(e, root.ownerSVGElement);
		const vertex = working.bodies[handle.body][handle.point];
		vertex.x = x;
		vertex.y = y;
	}

	function handleDragEnd() {
		if (!working) return;
		const edited = working;
		working = null;
		commitWorking([edited]);
	}

	// A tool switch mid-gesture removes this tile's element, whose drag then never ends
	onDestroy(() => {
		if (working) dropWorking([working]);
	});
</script>

<!-- A handle per vertex of every selected cell -->
<g role="presentation" onpointerdown={handlePointerDown} bind:this={root}>
	{#each shown as entry, cellIndex (entry.cell.ObjectID)}
		{#each entry.bodies as body, bodyIndex (bodyIndex)}
			{#each body as point, pointIndex (pointIndex)}
				<rect
					data-cell={cellIndex}
					data-body={bodyIndex}
					data-point={pointIndex}
					x={point.x - halfSize}
					y={point.y - halfSize}
					width={halfSize * 2}
					height={halfSize * 2}
					fill="pink"
					stroke="black"
					stroke-width={halfSize / 3}
					cursor="crosshair"
				/>
			{/each}
		{/each}
	{/each}
</g>
