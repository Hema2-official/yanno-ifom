<script lang="ts">
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { inputState } from '$lib/states/InputState.svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import type { Point, Polygon } from '$lib/types/geometry.type';
	import { cellBodyToPath, getPointerViewBoxCoords } from '$lib/utils/display';
	import { getPolygonsBoundsCached } from '$lib/utils/geometry';
	import { startDrag } from './drag';
	import { WorkingCell, commitWorking, outlinesOf, type OutlineEntry } from './working.svelte';
	import type { EditorToolProps } from './types';
	import { PersistedState } from 'runed';

	let { frameIndex, cells }: EditorToolProps = $props();

	const uid = $props.id();
	let root: SVGGElement | undefined = $state();

	// Private copies of the cells under the brush, only during a gesture
	let working: WorkingCell[] | null = $state.raw(null);
	let dragOrigin: Point = $state.raw({ x: 0, y: 0 });
	// Each point's influence and start position, frozen at the drag's start
	let coeffs: number[][][] = [];
	let startPositions: Point[][][] = [];

	// The selected cells, or every cell of the frame while nothing is selected here
	const targetCells = $derived(
		cells.length > 0 ? cells : (annotationState.getFrame(frameIndex) ?? [])
	);
	const shown: OutlineEntry[] = $derived(working ?? outlinesOf(targetCells));

	const storedRadius = new PersistedState('editor.tools.smooth.radius', 10, { syncTabs: false });
	const radius = $derived(storedRadius.current);
	const pointerHere = $derived(inputState.pointer?.frameIndex === frameIndex);
	// The brush stays at the drag origin while dragging
	const brush: Point = $derived(working ? dragOrigin : (inputState.pointer ?? { x: 0, y: 0 }));

	/** How much a point follows a drag from `center`: 1 there, falling off to 0 at the radius. */
	const influence = (point: Point, center: Point) =>
		1 - Math.min(Math.hypot(point.x - center.x, point.y - center.y) / radius, 1);

	/** Whether the brush at `center` reaches the entry's bounding box. */
	const withinReach = ({ bodies }: OutlineEntry, center: Point) => {
		const b = getPolygonsBoundsCached(bodies);
		return (
			center.x >= b.minX - radius &&
			center.x <= b.maxX + radius &&
			center.y >= b.minY - radius &&
			center.y <= b.maxY + radius
		);
	};

	// Only the cells under the brush get vertex markers
	const nearby = $derived(working ? [] : shown.filter((entry) => withinReach(entry, brush)));

	const light = '#ffffff';
	const dark = '#0f172a';
	// One "screen unit" in viewBox coordinates keeps the ring and markers crisp at any zoom
	const u = $derived(100 / svgState.svgScalePercent);

	const RADIUS_STEP = 1.08;
	const MIN_RADIUS = 1;
	const viewBox = $derived(svgState.svgViewBox);
	const maxRadius = $derived(Math.max(viewBox.width, viewBox.height) / 2);

	function handlePointerDown(e: PointerEvent) {
		if (e.button !== 0 || !root?.ownerSVGElement) return;
		if (!(e.target as SVGElement).hasAttribute('data-band')) return;

		// Every target cell with a vertex under the brush takes part in the drag
		const origin = getPointerViewBoxCoords(e, root.ownerSVGElement);
		const affected = shown.filter(
			(entry) =>
				withinReach(entry, origin) &&
				entry.bodies.some((body) => body.some((point) => influence(point, origin) > 0))
		);
		if (affected.length === 0) return;

		e.preventDefault();
		e.stopPropagation();
		if (!startDrag(root, e, { onMove: handleDragMove, onEnd: handleDragEnd })) return;

		dragOrigin = origin;
		working = affected.map(({ cell }) => new WorkingCell(cell));
		coeffs = working.map((entry) =>
			entry.bodies.map((body) => body.map((point) => influence(point, origin)))
		);
		startPositions = working.map((entry) =>
			entry.bodies.map((body) => body.map(({ x, y }) => ({ x, y })))
		);
	}

	function handleDragMove(e: PointerEvent) {
		if (!working || !root?.ownerSVGElement) return;
		const pointer = getPointerViewBoxCoords(e, root.ownerSVGElement);
		const deltaX = pointer.x - dragOrigin.x;
		const deltaY = pointer.y - dragOrigin.y;

		working.forEach((entry, cellIndex) =>
			entry.bodies.forEach((body, bodyIndex) =>
				body.forEach((point, pointIndex) => {
					const coeff = coeffs[cellIndex][bodyIndex][pointIndex];
					if (coeff === 0) return;
					const start = startPositions[cellIndex][bodyIndex][pointIndex];
					point.x = start.x + deltaX * coeff;
					point.y = start.y + deltaY * coeff;
				})
			)
		);
	}

	function handleDragEnd() {
		if (!working) return;
		const edited = working;
		working = null;
		commitWorking(edited);
	}

	function handleWheel(e: WheelEvent) {
		if (e.ctrlKey) return; // Ctrl+wheel is the display's zoom

		e.preventDefault();
		e.stopPropagation();
		const factor = e.deltaY > 0 ? 1 / RADIUS_STEP : RADIUS_STEP;
		storedRadius.current = Math.min(maxRadius, Math.max(MIN_RADIUS, radius * factor));
	}
</script>

{#snippet markers(
	bodies: Polygon[],
	opacityOf: (point: Point, bodyIndex: number, pointIndex: number) => number
)}
	{#each bodies as body, bodyIndex (bodyIndex)}
		{#each body as point, pointIndex (pointIndex)}
			{@const opacity = opacityOf(point, bodyIndex, pointIndex)}
			{#if opacity > 0}
				<circle
					cx={point.x}
					cy={point.y}
					r={1.75 * u}
					fill={light}
					stroke={dark}
					stroke-width={0.75 * u}
					{opacity}
				/>
			{/if}
		{/each}
	{/each}
{/snippet}

<defs>
	<radialGradient id="smooth-falloff-{uid}">
		<stop offset="0%" stop-color={light} stop-opacity="0.35" />
		<stop offset="100%" stop-color={light} stop-opacity="0" />
	</radialGradient>
</defs>

<!-- Wheel over the frame changes the radius; a band of it around each outline starts a drag -->
<g role="presentation" onwheel={handleWheel}>
	<rect
		x={viewBox.minX}
		y={viewBox.minY}
		width={viewBox.width}
		height={viewBox.height}
		class="fill-transparent stroke-none"
	/>
	<g role="presentation" onpointerdown={handlePointerDown} bind:this={root}>
		{#each shown as entry (entry.cell.ObjectID)}
			{#each entry.bodies as body, bodyIndex (bodyIndex)}
				<path
					data-band
					d={cellBodyToPath(body)}
					stroke-width={radius * 2}
					stroke-linejoin="round"
					stroke-linecap="round"
					class="cursor-crosshair fill-none stroke-transparent"
				/>
			{/each}
		{/each}
	</g>
</g>

<!-- The working outlines on top of the base cells, which stay as ghosts -->
{#if working}
	<g pointer-events="none">
		{#each working as entry (entry.cell.ObjectID)}
			{#each entry.bodies as body, bodyIndex (bodyIndex)}
				<path
					d={cellBodyToPath(body)}
					stroke={svgState.svgStroke.current}
					class="fill-none stroke-1 opacity-80"
				/>
			{/each}
		{/each}
	</g>
{/if}

<!-- The brush ring and the vertices under it -->
{#if pointerHere || working}
	<g pointer-events="none">
		<circle cx={brush.x} cy={brush.y} r={radius} fill="url('#smooth-falloff-{uid}')" />
		<circle
			cx={brush.x}
			cy={brush.y}
			r={radius}
			fill="none"
			stroke={dark}
			stroke-width={3 * u}
			opacity="0.65"
		/>
		<circle cx={brush.x} cy={brush.y} r={radius} fill="none" stroke={light} stroke-width={u} />

		{#if working}
			<!-- Markers follow the moving points, faded by their frozen influence -->
			{#each working as entry, cellIndex (entry.cell.ObjectID)}
				{@render markers(
					entry.bodies,
					(point, bodyIndex, pointIndex) =>
						coeffs[cellIndex]?.[bodyIndex]?.[pointIndex] ?? 0
				)}
			{/each}
		{:else}
			{#each nearby as entry (entry.cell.ObjectID)}
				{@render markers(entry.bodies, (point) => influence(point, brush))}
			{/each}
		{/if}
	</g>
{/if}
