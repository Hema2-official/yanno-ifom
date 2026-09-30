<script lang="ts">
	import { keybindings } from '$lib/states/KeybindingState.svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import { zoomState } from '$lib/states/zoom.svelte';
	import type { Point } from '$lib/types/geometry.type';
	import { cellBodyToPath, getPointerViewBoxCoords } from '$lib/utils/display';
	import { getPolygonsBounds, type Bounds } from '$lib/utils/geometry';
	import { watch } from 'runed';
	import { startDrag } from '$lib/utils/drag';
	import { WorkingCell, commitWorking, outlinesOf } from './working.svelte';
	import type { EditorToolProps } from './types';

	let { cells }: EditorToolProps = $props();

	let root: SVGGElement | undefined = $state();

	// Private copies of the selected outlines, only during a gesture
	let working: WorkingCell[] | null = $state.raw(null);
	let gesture: 'move' | 'rotate' | 'resize' | null = $state(null);

	const shown = $derived(working ?? outlinesOf(cells));
	const bodies = $derived(shown.flatMap((entry) => entry.bodies));
	const bounds = $derived(getPolygonsBounds(bodies));
	const boxWidth = $derived(bounds.maxX - bounds.minX);
	const boxHeight = $derived(bounds.maxY - bounds.minY);

	// Frozen at the start of a gesture
	let dragOrigin: Point = { x: 0, y: 0 };
	let startBounds: Bounds | null = null;
	let startPositions: Point[][] = [];
	let polar: { dist: number; angle: number }[][] = [];
	const resizeDirection: Point = { x: 0, y: 0 };
	let lastPointerEvent: PointerEvent | null = null;

	const scaleFromCenter = $derived(keybindings.isHeld('whole.scaleFromCenter'));
	const keepAspect = $derived(keybindings.isHeld('whole.keepAspect'));

	const light = '#ffffff';
	const dark = '#0f172a';

	const u = $derived(zoomState.screenUnit);
	const handleHalf = $derived(4 * u);
	const handleStroke = $derived(1.5 * u);
	const cornerHit = $derived(7 * u);
	const edgeHit = $derived(10 * u);
	const rotateOffset = $derived(18 * u);
	const rotateRadius = $derived(4.5 * u);

	// Resize handles: where they sit and which sides of the box they pull
	type Handle = { x: number; y: number; dx: number; dy: number };
	const corners: Handle[] = $derived([
		{ x: bounds.minX, y: bounds.minY, dx: -1, dy: -1 },
		{ x: bounds.maxX, y: bounds.minY, dx: 1, dy: -1 },
		{ x: bounds.minX, y: bounds.maxY, dx: -1, dy: 1 },
		{ x: bounds.maxX, y: bounds.maxY, dx: 1, dy: 1 }
	]);
	const edges: Handle[] = $derived([
		{ x: bounds.midX, y: bounds.minY, dx: 0, dy: -1 },
		{ x: bounds.midX, y: bounds.maxY, dx: 0, dy: 1 },
		{ x: bounds.minX, y: bounds.midY, dx: -1, dy: 0 },
		{ x: bounds.maxX, y: bounds.midY, dx: 1, dy: 0 }
	]);
	const resizeCursor = ({ dx, dy }: Handle) =>
		dx === 0 ? 'ns-resize' : dy === 0 ? 'ew-resize' : dx === dy ? 'nwse-resize' : 'nesw-resize';

	const showResizeHandles = $derived(gesture !== 'move' && gesture !== 'rotate');

	function handlePointerDown(e: PointerEvent) {
		if (e.button !== 0 || !root?.ownerSVGElement) return;
		const handle = (e.target as SVGElement).dataset.handle;
		if (handle === undefined) return;

		e.preventDefault();
		e.stopPropagation();
		if (!startDrag(root, e, { onMove: handleDragMove, onEnd: handleDragEnd })) return;

		dragOrigin = getPointerViewBoxCoords(e, root.ownerSVGElement);
		working = cells.map((cell) => new WorkingCell(cell));
		startBounds = bounds;
		startPositions = bodies.map((body) => body.map(({ x, y }) => ({ x, y })));
		lastPointerEvent = null;

		if (handle === 'move') {
			gesture = 'move';
		} else if (handle === 'rotate') {
			const { midX, midY } = bounds;
			polar = bodies.map((body) =>
				body.map(({ x, y }) => ({
					dist: Math.hypot(x - midX, y - midY),
					angle: Math.atan2(y - midY, x - midX)
				}))
			);
			gesture = 'rotate';
		} else {
			[resizeDirection.x, resizeDirection.y] = handle.split(':').map(Number);
			gesture = 'resize';
		}
	}

	function handleDragMove(e: PointerEvent) {
		if (!working || !startBounds || !root?.ownerSVGElement) return;
		lastPointerEvent = e;
		const pointer = getPointerViewBoxCoords(e, root.ownerSVGElement);
		const deltaX = pointer.x - dragOrigin.x;
		const deltaY = pointer.y - dragOrigin.y;

		if (gesture === 'move') {
			bodies.forEach((body, bodyIndex) =>
				body.forEach((point, pointIndex) => {
					const start = startPositions[bodyIndex][pointIndex];
					point.x = start.x + deltaX;
					point.y = start.y + deltaY;
				})
			);
			return;
		}

		const { midX, midY } = startBounds;
		if (gesture === 'rotate') {
			const angle =
				Math.atan2(pointer.y - midY, pointer.x - midX) -
				Math.atan2(dragOrigin.y - midY, dragOrigin.x - midX);
			bodies.forEach((body, bodyIndex) =>
				body.forEach((point, pointIndex) => {
					const { dist, angle: start } = polar[bodyIndex][pointIndex];
					point.x = midX + Math.cos(start + angle) * dist;
					point.y = midY + Math.sin(start + angle) * dist;
				})
			);
			return;
		}

		// Resize: scaling around the center moves both sides
		const { x: dirX, y: dirY } = resizeDirection;
		const factor = scaleFromCenter ? 2 : 1;
		const width = Math.max(startBounds.maxX - startBounds.minX, 1e-5);
		const height = Math.max(startBounds.maxY - startBounds.minY, 1e-5);
		let scaleX = dirX === 0 ? 1 : 1 + (factor * dirX * deltaX) / width;
		let scaleY = dirY === 0 ? 1 : 1 + (factor * dirY * deltaY) / height;
		if (keepAspect) {
			if (dirX !== 0 && dirY !== 0) scaleX = scaleY = (scaleX + scaleY) / 2;
			else if (dirX !== 0) scaleY = scaleX;
			else scaleX = scaleY;
		}
		const pivotX =
			scaleFromCenter || dirX === 0 ? midX : dirX < 0 ? startBounds.maxX : startBounds.minX;
		const pivotY =
			scaleFromCenter || dirY === 0 ? midY : dirY < 0 ? startBounds.maxY : startBounds.minY;
		bodies.forEach((body, bodyIndex) =>
			body.forEach((point, pointIndex) => {
				const start = startPositions[bodyIndex][pointIndex];
				point.x = pivotX + (start.x - pivotX) * scaleX;
				point.y = pivotY + (start.y - pivotY) * scaleY;
			})
		);
	}

	function handleDragEnd() {
		if (!working) return;
		const edited = working;
		working = null;
		gesture = null;
		commitWorking(edited);
	}

	// Modifier changes re-apply the last resize with the new rules
	watch([() => scaleFromCenter, () => keepAspect], () => {
		if (lastPointerEvent) handleDragMove(lastPointerEvent);
	});
</script>

{#if bodies.length > 0}
	{#if working}
		<!-- Working outlines while dragging; the base cells stay as ghosts -->
		<g pointer-events="none">
			{#each bodies as body, i (i)}
				<path
					d={cellBodyToPath(body)}
					stroke={svgState.svgStroke.current}
					stroke-dasharray="3, 2"
					class="fill-none stroke-1 opacity-80"
				/>
			{/each}
		</g>
	{/if}

	<!-- Handle visuals -->
	<g pointer-events="none">
		{#if gesture !== 'rotate'}
			<rect
				x={bounds.minX}
				y={bounds.minY}
				width={boxWidth}
				height={boxHeight}
				fill="none"
				stroke={dark}
				stroke-width={3 * u}
				opacity="0.55"
			/>
			<rect
				x={bounds.minX}
				y={bounds.minY}
				width={boxWidth}
				height={boxHeight}
				fill="none"
				stroke={light}
				stroke-width={u}
			/>
		{/if}

		{#if !working}
			<!-- rotation stem and knob -->
			<line
				x1={bounds.midX}
				y1={bounds.minY}
				x2={bounds.midX}
				y2={bounds.minY - rotateOffset + rotateRadius}
				stroke={dark}
				stroke-width={3 * u}
				opacity="0.55"
			/>
			<line
				x1={bounds.midX}
				y1={bounds.minY}
				x2={bounds.midX}
				y2={bounds.minY - rotateOffset + rotateRadius}
				stroke={light}
				stroke-width={u}
			/>
			<circle
				cx={bounds.midX}
				cy={bounds.minY - rotateOffset}
				r={rotateRadius}
				fill={light}
				stroke={dark}
				stroke-width={handleStroke}
			/>
		{/if}

		{#if showResizeHandles}
			{#each edges as edge, i (i)}
				{@const w = edge.dx === 0 ? 10 * u : 4 * u}
				{@const h = edge.dx === 0 ? 4 * u : 10 * u}
				<rect
					x={edge.x - w / 2}
					y={edge.y - h / 2}
					width={w}
					height={h}
					rx={2 * u}
					fill={light}
					stroke={dark}
					stroke-width={handleStroke}
				/>
			{/each}
			{#each corners as corner, i (i)}
				<rect
					x={corner.x - handleHalf}
					y={corner.y - handleHalf}
					width={handleHalf * 2}
					height={handleHalf * 2}
					fill={light}
					stroke={dark}
					stroke-width={handleStroke}
				/>
			{/each}
		{/if}
	</g>

	<!-- Hit targets -->
	<g role="presentation" onpointerdown={handlePointerDown} bind:this={root}>
		<!-- Dragging a selected cell moves the whole selection -->
		{#each bodies as body, i (i)}
			<path
				data-handle="move"
				d={cellBodyToPath(body)}
				class="cursor-move fill-transparent"
			/>
		{/each}
		{#if !working}
			<circle
				data-handle="rotate"
				cx={bounds.midX}
				cy={bounds.minY - rotateOffset}
				r={10 * u}
				class="cursor-ew-resize fill-transparent"
			/>
		{/if}
		{#if showResizeHandles}
			{#each edges as edge, i (i)}
				{@const vertical = edge.dx !== 0}
				<line
					data-handle="{edge.dx}:{edge.dy}"
					x1={vertical ? edge.x : bounds.minX}
					y1={vertical ? bounds.minY : edge.y}
					x2={vertical ? edge.x : bounds.maxX}
					y2={vertical ? bounds.maxY : edge.y}
					stroke-width={edgeHit}
					class="stroke-transparent"
					style:cursor={resizeCursor(edge)}
				/>
			{/each}
			{#each corners as corner, i (i)}
				<rect
					data-handle="{corner.dx}:{corner.dy}"
					x={corner.x - cornerHit}
					y={corner.y - cornerHit}
					width={cornerHit * 2}
					height={cornerHit * 2}
					class="fill-transparent"
					style:cursor={resizeCursor(corner)}
				/>
			{/each}
		{/if}
	</g>
{/if}
