<script lang="ts">
	import { inputState } from '$lib/states/InputState.svelte';
	import { optionsState } from '$lib/states/options.svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import type { Point } from '$lib/types/geometry.type';
	import { cellBodyToPath, getPointerViewBoxCoords } from '$lib/utils/display';
	import { getPolygonsBounds, resampleCellBodies, type Bounds } from '$lib/utils/geometry';
	import { P } from '$lib/utils/pattern';
	import { watch } from 'runed';
	import { overrideDisplayPointerWhile } from './interaction.svelte';
	import type { EditorToolProps } from './types';

	let { bodies = $bindable(), pushLocalState }: EditorToolProps = $props();

	let interactiveRoot: SVGGElement | undefined = $state();
	let svgElement = $derived(interactiveRoot?.ownerSVGElement);

	let isMouseDown = $state(false);
	let isRotating = $state(false);
	let isMoving = $state(false);

	overrideDisplayPointerWhile(
		() => isMouseDown,
		(e) => handleMouseMove(e),
		(e) => handleMouseUp(e)
	);

	let mouseStartPos: Point = { x: 0, y: 0 };
	let lastMouseEvent: MouseEvent | undefined = $state();

	// Per point in each body, captured at the start of a gesture
	let rotateCoeffs: { dist: number; angle: number }[][] = [];
	let moveStartPositions: Point[][] = [];
	let resizeStartPositions: Point[][] = [];

	let startBounds: Bounds | undefined;

	let isCtrlHeld = $derived(inputState.pressedKeys.has('Control'));
	let isShiftHeld = $derived(inputState.pressedKeys.has('Shift'));

	const resizeDirection: Point = { x: 0, y: 0 };
	const resizeIdPattern = P('hdl_#:#');

	const light = '#ffffff';
	const dark = '#0f172a';

	const bounds = $derived(getPolygonsBounds(bodies));
	const boxWidth = $derived(bounds.maxX - bounds.minX);
	const boxHeight = $derived(bounds.maxY - bounds.minY);

	// One "screen unit" in viewBox coordinates: keeps handles the same on-screen size at any zoom.
	const u = $derived(100 / svgState.svgScalePercent);
	const hairline = $derived(u); // visible line width
	const halo = $derived(3 * u); // dark outline
	const handleHalf = $derived(4 * u); // visible corner handle
	const handleStroke = $derived(1.5 * u);
	const cornerHit = $derived(7 * u); // corner hit area
	const edgeHit = $derived(10 * u); // edge hit strip
	const rotateOffset = $derived(18 * u); // distance of the rotation knob above the box
	const rotateRadius = $derived(4.5 * u);
	const rotateHit = $derived(10 * u);

	const showResizeHandles = $derived(!isMouseDown || (!isRotating && !isMoving));

	function copyPositions() {
		return bodies.map((body) => body.map((point) => ({ ...point })));
	}

	function handleMouseDown(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		if (!svgElement) return;

		const target = e.target as SVGElement;
		if (!target.id.startsWith('hdl')) return;

		// Rotate
		if (target.id === 'hdl_r') {
			mouseStartPos = getPointerViewBoxCoords(e, svgElement);
			startBounds = { ...bounds };

			rotateCoeffs = bodies.map((body) =>
				body.map((point) => {
					const dx = point.x - bounds.midX;
					const dy = point.y - bounds.midY;
					return {
						dist: Math.hypot(dx, dy),
						angle: Math.atan2(dy, dx)
					};
				})
			);

			isRotating = true;
			isMouseDown = true;
			return;
		}

		// Move
		if (target.id === 'hdl_m') {
			mouseStartPos = getPointerViewBoxCoords(e, svgElement);
			moveStartPositions = copyPositions();

			isMoving = true;
			isMouseDown = true;
			return;
		}

		// Resize
		startBounds = { ...bounds };

		[resizeDirection.x, resizeDirection.y] = resizeIdPattern.match(target.id);

		mouseStartPos = getPointerViewBoxCoords(e, svgElement);
		resizeStartPositions = copyPositions();

		lastMouseEvent = undefined;
		isMouseDown = true;
	}

	function handleMouseUp(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		if (!isMouseDown) return;
		isRotating = false;
		isMoving = false;
		isMouseDown = false;
		lastMouseEvent = undefined;

		if (optionsState.autoResample)
			bodies = resampleCellBodies(bodies, optionsState.resampleSegmentLength);
		pushLocalState();
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isMouseDown) return;

		e.preventDefault();
		e.stopPropagation();

		if (!svgElement) return;
		const mouseViewBox = getPointerViewBoxCoords(e, svgElement);

		if (isMoving) {
			const deltaX = mouseViewBox.x - mouseStartPos.x;
			const deltaY = mouseViewBox.y - mouseStartPos.y;
			for (const [bodyIndex, body] of bodies.entries()) {
				for (const [pointIndex, point] of body.entries()) {
					point.x = moveStartPositions[bodyIndex][pointIndex].x + deltaX;
					point.y = moveStartPositions[bodyIndex][pointIndex].y + deltaY;
				}
			}
			return;
		}

		if (!startBounds) return;

		if (isRotating) {
			const mouseAngle =
				Math.atan2(mouseViewBox.y - startBounds.midY, mouseViewBox.x - startBounds.midX) -
				Math.atan2(mouseStartPos.y - startBounds.midY, mouseStartPos.x - startBounds.midX);

			for (const [bodyIndex, body] of bodies.entries()) {
				for (const [pointIndex, point] of body.entries()) {
					const coeff = rotateCoeffs[bodyIndex][pointIndex];
					const angle = coeff.angle + mouseAngle;
					point.x = startBounds.midX + Math.cos(angle) * coeff.dist;
					point.y = startBounds.midY + Math.sin(angle) * coeff.dist;
				}
			}
			return;
		}

		lastMouseEvent = e;

		const mouseDeltaX = mouseViewBox.x - mouseStartPos.x;
		const mouseDeltaY = mouseViewBox.y - mouseStartPos.y;

		const w = Math.max(startBounds.maxX - startBounds.minX, 1e-5);
		const h = Math.max(startBounds.maxY - startBounds.minY, 1e-5);

		let s_x = 1;
		let s_y = 1;

		if (resizeDirection.x !== 0) {
			const factor = isCtrlHeld ? 2 : 1;
			s_x = 1 + (factor * resizeDirection.x * mouseDeltaX) / w;
		}
		if (resizeDirection.y !== 0) {
			const factor = isCtrlHeld ? 2 : 1;
			s_y = 1 + (factor * resizeDirection.y * mouseDeltaY) / h;
		}

		if (isShiftHeld) {
			if (resizeDirection.x !== 0 && resizeDirection.y !== 0) {
				s_x = s_y = (s_x + s_y) / 2;
			} else if (resizeDirection.x !== 0) {
				s_y = s_x;
			} else if (resizeDirection.y !== 0) {
				s_x = s_y;
			}
		}

		let pivot_x = startBounds.midX;
		let pivot_y = startBounds.midY;

		if (!isCtrlHeld) {
			if (resizeDirection.x === -1) pivot_x = startBounds.maxX;
			else if (resizeDirection.x === 1) pivot_x = startBounds.minX;

			if (resizeDirection.y === -1) pivot_y = startBounds.maxY;
			else if (resizeDirection.y === 1) pivot_y = startBounds.minY;
		}

		for (const [bodyIndex, body] of bodies.entries()) {
			for (const [pointIndex, point] of body.entries()) {
				const startPoint = resizeStartPositions[bodyIndex][pointIndex];
				point.x = pivot_x + (startPoint.x - pivot_x) * s_x;
				point.y = pivot_y + (startPoint.y - pivot_y) * s_y;
			}
		}
	}

	watch([() => isCtrlHeld, () => isShiftHeld], () => {
		if (isMouseDown && lastMouseEvent) {
			handleMouseMove(lastMouseEvent);
		}
	});
</script>

<!-- Non-interactive elements -->
{#each bodies as body, i (i)}
	<path
		id="body{i}"
		d={cellBodyToPath(body)}
		stroke={svgState.svgStroke}
		stroke-dasharray="3, 2"
		class="fill-none stroke-1 opacity-80"
	/>
{/each}

<!-- Handle visuals -->
<g pointer-events="none">
	{#if !isRotating}
		<!-- bounding box -->
		<rect
			x={bounds.minX}
			y={bounds.minY}
			width={boxWidth}
			height={boxHeight}
			fill="none"
			stroke={dark}
			stroke-width={halo}
			opacity="0.55"
		/>
		<rect
			x={bounds.minX}
			y={bounds.minY}
			width={boxWidth}
			height={boxHeight}
			fill="none"
			stroke={light}
			stroke-width={hairline}
		/>
	{/if}

	{#if !isMouseDown}
		<!-- rotation stem + knob -->
		<line
			x1={bounds.midX}
			y1={bounds.minY}
			x2={bounds.midX}
			y2={bounds.minY - rotateOffset + rotateRadius}
			stroke={dark}
			stroke-width={halo}
			opacity="0.55"
		/>
		<line
			x1={bounds.midX}
			y1={bounds.minY}
			x2={bounds.midX}
			y2={bounds.minY - rotateOffset + rotateRadius}
			stroke={light}
			stroke-width={hairline}
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
		{@const corners = [
			[bounds.minX, bounds.minY],
			[bounds.maxX, bounds.minY],
			[bounds.minX, bounds.maxY],
			[bounds.maxX, bounds.maxY]
		]}
		{@const edges = [
			{ x: bounds.midX, y: bounds.minY, horizontal: true },
			{ x: bounds.midX, y: bounds.maxY, horizontal: true },
			{ x: bounds.minX, y: bounds.midY, horizontal: false },
			{ x: bounds.maxX, y: bounds.midY, horizontal: false }
		]}
		<!-- edge midpoint pills -->
		{#each edges as edge, i (i)}
			{@const w = edge.horizontal ? 10 * u : 4 * u}
			{@const h = edge.horizontal ? 4 * u : 10 * u}
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
		<!-- corner squares -->
		{#each corners as [x, y], i (i)}
			<rect
				x={x - handleHalf}
				y={y - handleHalf}
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
<g
	role="presentation"
	onmousedown={handleMouseDown}
	onmouseup={handleMouseUp}
	onmousemove={handleMouseMove}
	bind:this={interactiveRoot}
>
	<rect
		id="hdl_m"
		x={bounds.minX}
		y={bounds.minY}
		width={boxWidth}
		height={boxHeight}
		class="cursor-move fill-transparent stroke-none"
	/>
	{#if !isMouseDown}
		<!-- rotate -->
		<circle
			id="hdl_r"
			cx={bounds.midX}
			cy={bounds.minY - rotateOffset}
			r={rotateHit}
			class="cursor-ew-resize fill-transparent"
		/>
	{/if}
	{#if showResizeHandles}
		<!-- top -->
		<line
			id="hdl_0:-1"
			x1={bounds.minX}
			y1={bounds.minY}
			x2={bounds.maxX}
			y2={bounds.minY}
			stroke-width={edgeHit}
			class="cursor-ns-resize stroke-transparent"
		/>
		<!-- bottom -->
		<line
			id="hdl_0:1"
			x1={bounds.minX}
			y1={bounds.maxY}
			x2={bounds.maxX}
			y2={bounds.maxY}
			stroke-width={edgeHit}
			class="cursor-ns-resize stroke-transparent"
		/>
		<!-- left -->
		<line
			id="hdl_-1:0"
			x1={bounds.minX}
			y1={bounds.minY}
			x2={bounds.minX}
			y2={bounds.maxY}
			stroke-width={edgeHit}
			class="cursor-ew-resize stroke-transparent"
		/>
		<!-- right -->
		<line
			id="hdl_1:0"
			x1={bounds.maxX}
			y1={bounds.minY}
			x2={bounds.maxX}
			y2={bounds.maxY}
			stroke-width={edgeHit}
			class="cursor-ew-resize stroke-transparent"
		/>

		<!-- top left -->
		<rect
			id="hdl_-1:-1"
			x={bounds.minX - cornerHit}
			y={bounds.minY - cornerHit}
			width={cornerHit * 2}
			height={cornerHit * 2}
			class="cursor-nwse-resize fill-transparent"
		/>
		<!-- top right -->
		<rect
			id="hdl_1:-1"
			x={bounds.maxX - cornerHit}
			y={bounds.minY - cornerHit}
			width={cornerHit * 2}
			height={cornerHit * 2}
			class="cursor-nesw-resize fill-transparent"
		/>
		<!-- bottom left -->
		<rect
			id="hdl_-1:1"
			x={bounds.minX - cornerHit}
			y={bounds.maxY - cornerHit}
			width={cornerHit * 2}
			height={cornerHit * 2}
			class="cursor-nesw-resize fill-transparent"
		/>
		<!-- bottom right -->
		<rect
			id="hdl_1:1"
			x={bounds.maxX - cornerHit}
			y={bounds.maxY - cornerHit}
			width={cornerHit * 2}
			height={cornerHit * 2}
			class="cursor-nwse-resize fill-transparent"
		/>
	{/if}
</g>
