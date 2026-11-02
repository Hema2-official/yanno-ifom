<script module lang="ts">
	import { WorkingCell, commitWorking, dropWorking, outlinesOf } from './working.svelte';

	// One gesture edits the whole selection, across the frames, from whichever tile it started in
	let working: WorkingCell[] | null = $state.raw(null);
	let gesture: 'move' | 'rotate' | 'resize' | null = $state(null);
</script>

<script lang="ts">
	import { editorState } from '$lib/states/EditorState.svelte';
	import { keybindings } from '$lib/states/KeybindingState.svelte';
	import { zoomState } from '$lib/states/zoom.svelte';
	import type { Point } from '$lib/types/geometry.type';
	import { cellBodyToPath, getPointerViewBoxCoords } from '$lib/utils/display';
	import { getPolygonsBounds, type Bounds } from '$lib/utils/geometry';
	import { watch } from 'runed';
	import { onDestroy } from 'svelte';
	import { selectionClick, startGesture } from '$lib/ui/annotation/gestures';
	import type { EditorToolProps } from './types';

	let { frameIndex }: EditorToolProps = $props();

	let root: SVGGElement | undefined = $state();
	let dragging = false;

	// The box holds the selection of every frame; this tile draws its own frame's part
	const shown = $derived(working ?? outlinesOf(editorState.selectedCells));
	const bounds = $derived(getPolygonsBounds(shown.flatMap((entry) => entry.bodies)));
	const bodies = $derived(
		shown.filter(({ cell }) => cell.Frame === frameIndex).flatMap((entry) => entry.bodies)
	);
	const boxWidth = $derived(bounds.maxX - bounds.minX);
	const boxHeight = $derived(bounds.maxY - bounds.minY);

	// Frozen at the start of a gesture, by the tile it started in
	let dragOrigin: Point = { x: 0, y: 0 };
	let startBounds: Bounds | null = null;
	// Per working cell, body and point
	let startPositions: Point[][][] = [];
	let centers: Point[] = [];
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
		if (e.button !== 0 || !root) return;
		const handle = (e.target as SVGElement).dataset.handle;
		if (handle === undefined) return;

		e.preventDefault();
		e.stopPropagation();
		// A click on a cell selects it; one on a handle does nothing
		startGesture(root, e, {
			onStart: (press) => begin(press, handle),
			onMove: handleDragMove,
			onEnd: handleDragEnd,
			onClick: handle === 'move' ? selectionClick : null
		});
	}

	function begin(press: PointerEvent, handle: string) {
		if (!root?.ownerSVGElement) return;
		dragging = true;
		dragOrigin = getPointerViewBoxCoords(press, root.ownerSVGElement);
		const edited = editorState.selectedCells.map((cell) => new WorkingCell(cell));
		startBounds = bounds;
		startPositions = edited.map((entry) =>
			entry.bodies.map((body) => body.map(({ x, y }) => ({ x, y })))
		);
		centers = edited.map((entry) => {
			const { midX, midY } = getPolygonsBounds(entry.bodies);
			return { x: midX, y: midY };
		});
		lastPointerEvent = null;
		working = edited;

		if (handle === 'move' || handle === 'rotate') {
			gesture = handle;
		} else {
			[resizeDirection.x, resizeDirection.y] = handle.split(':').map(Number);
			gesture = 'resize';
		}
	}

	/** Moves every working point to where `to` takes its start position. */
	function place(to: (start: Point, cellIndex: number) => Point) {
		working?.forEach((entry, cellIndex) =>
			entry.bodies.forEach((body, bodyIndex) =>
				body.forEach((point, pointIndex) => {
					const { x, y } = to(
						startPositions[cellIndex][bodyIndex][pointIndex],
						cellIndex
					);
					point.x = x;
					point.y = y;
				})
			)
		);
	}

	function handleDragMove(e: PointerEvent) {
		if (!working || !startBounds || !root?.ownerSVGElement) return;
		lastPointerEvent = e;
		const pointer = getPointerViewBoxCoords(e, root.ownerSVGElement);
		const deltaX = pointer.x - dragOrigin.x;
		const deltaY = pointer.y - dragOrigin.y;

		if (gesture === 'move') {
			place(({ x, y }) => ({ x: x + deltaX, y: y + deltaY }));
			return;
		}

		const { midX, midY } = startBounds;
		if (gesture === 'rotate') {
			const angle =
				Math.atan2(pointer.y - midY, pointer.x - midX) -
				Math.atan2(dragOrigin.y - midY, dragOrigin.x - midX);
			const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
			place(({ x, y }) => ({
				x: midX + (x - midX) * cos - (y - midY) * sin,
				y: midY + (x - midX) * sin + (y - midY) * cos
			}));
			return;
		}

		// Resize: scaling around the centers moves both sides
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
		// The opposite sides stay put, or each cell's center
		const opposite = {
			x: dirX < 0 ? startBounds.maxX : startBounds.minX,
			y: dirY < 0 ? startBounds.maxY : startBounds.minY
		};
		place((start, cellIndex) => {
			const pivot = scaleFromCenter ? centers[cellIndex] : opposite;
			return {
				x: pivot.x + (start.x - pivot.x) * scaleX,
				y: pivot.y + (start.y - pivot.y) * scaleY
			};
		});
	}

	function handleDragEnd() {
		dragging = false;
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

	// A tool switch mid-gesture removes this tile's element, whose drag then never ends
	onDestroy(() => {
		if (!dragging || !working) return;
		dropWorking(working);
		working = null;
		gesture = null;
	});
</script>

{#if bodies.length > 0}
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
