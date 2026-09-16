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

	const color1 = 'white';
	const color2 = 'gray';

	const bounds = $derived(getPolygonsBounds(bodies));
	let size = $derived(400 / svgState.svgScalePercent);

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
		fill="none"
		stroke="black"
		stroke-width="1"
		stroke-dasharray="3, 2"
		opacity="0.5"
	/>
{/each}

<!-- Interactive elements -->
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
		width={bounds.maxX - bounds.minX}
		height={bounds.maxY - bounds.minY}
		fill="transparent"
		stroke="none"
		cursor="move"
	/>
	{#if !isMouseDown}
		<!-- rotate -->
		<path
			id="hdl_r"
			d={`M${bounds.midX - size * 2},${bounds.minY - 2} Q${bounds.midX} ${bounds.minY - 2 - size},${bounds.midX + size * 2} ${bounds.minY - 2}`}
			fill="transparent"
			stroke={color1}
			stroke-width={size * 2}
			stroke-linecap="round"
			cursor="ew-resize"
		/>
	{/if}
	{#if !isMouseDown || (!isRotating && !isMoving)}
		<!-- top -->
		<line
			id="hdl_0:-1"
			x1={bounds.minX}
			y1={bounds.minY}
			x2={bounds.maxX}
			y2={bounds.minY}
			stroke={color2}
			stroke-width={size}
			cursor="ns-resize"
		/>
		<!-- bottom -->
		<line
			id="hdl_0:1"
			x1={bounds.minX}
			y1={bounds.maxY}
			x2={bounds.maxX}
			y2={bounds.maxY}
			stroke={color2}
			stroke-width={size}
			cursor="ns-resize"
		/>
		<!-- left -->
		<line
			id="hdl_-1:0"
			x1={bounds.minX}
			y1={bounds.minY}
			x2={bounds.minX}
			y2={bounds.maxY}
			stroke={color2}
			stroke-width={size}
			cursor="ew-resize"
		/>
		<!-- right -->
		<line
			id="hdl_1:0"
			x1={bounds.maxX}
			y1={bounds.minY}
			x2={bounds.maxX}
			y2={bounds.maxY}
			stroke={color2}
			stroke-width={size}
			cursor="ew-resize"
		/>

		<!-- top left -->
		<rect
			id="hdl_-1:-1"
			x={bounds.minX - size}
			y={bounds.minY - size}
			width={size * 2}
			height={size * 2}
			fill={color1}
			cursor="nwse-resize"
		/>
		<!-- top right -->
		<rect
			id="hdl_1:-1"
			x={bounds.maxX - size}
			y={bounds.minY - size}
			width={size * 2}
			height={size * 2}
			fill={color1}
			cursor="nesw-resize"
		/>
		<!-- bottom left -->
		<rect
			id="hdl_-1:1"
			x={bounds.minX - size}
			y={bounds.maxY - size}
			width={size * 2}
			height={size * 2}
			fill={color1}
			cursor="nesw-resize"
		/>
		<!-- bottom right -->
		<rect
			id="hdl_1:1"
			x={bounds.maxX - size}
			y={bounds.maxY - size}
			width={size * 2}
			height={size * 2}
			fill={color1}
			cursor="nwse-resize"
		/>
	{/if}
</g>
