<script lang="ts">
	import { optionsState } from '$lib/states/options.svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import type { Point } from '$lib/types/geometry.type';
	import { getMax, getMin } from '$lib/utils/data.svelte';
	import { cellBodyToPath, getPointerViewBoxCoords } from '$lib/utils/display';
	import { resampleCellBodies } from '$lib/utils/geometry';
	import { P } from '$lib/utils/pattern';
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

	// Per point in each body, captured at the start of a gesture
	let rotateCoeffs: { dist: number; angle: number }[][] = [];
	let moveStartPositions: Point[][] = [];
	let resizeCoeffs: Point[][] = [];
	let resizeStartPositions: Point[][] = [];

	const resizeDirection: Point = { x: 0, y: 0 };
	const resizeIdPattern = P('hdl_#:#');

	const color1 = 'white';
	const color2 = 'gray';

	let minX = $derived(getMin(bodies.map((body) => getMin(body.map((point) => point.x)))));
	let minY = $derived(getMin(bodies.map((body) => getMin(body.map((point) => point.y)))));
	let maxX = $derived(getMax(bodies.map((body) => getMax(body.map((point) => point.x)))));
	let maxY = $derived(getMax(bodies.map((body) => getMax(body.map((point) => point.y)))));
	let midX = $derived((minX + maxX) / 2);
	let midY = $derived((minY + maxY) / 2);
	let size = $derived(400 / svgState.svgScalePercent);

	const copyPositions = () => bodies.map((body) => body.map((point) => ({ ...point })));

	const handleMouseDown = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (!svgElement) return;

		const target = e.target as SVGElement;
		if (!target.id.startsWith('hdl')) return;

		// Rotate
		if (target.id === 'hdl_r') {
			mouseStartPos = getPointerViewBoxCoords(e, svgElement);

			rotateCoeffs = bodies.map((body) =>
				body.map((point) => {
					const dx = point.x - midX;
					const dy = point.y - midY;
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
		const width = maxX - minX;
		const height = maxY - minY;

		[resizeDirection.x, resizeDirection.y] = resizeIdPattern.match(target.id);

		mouseStartPos = {
			x: resizeDirection.x === 0 ? midX : resizeDirection.x === -1 ? minX : maxX,
			y: resizeDirection.y === 0 ? midY : resizeDirection.y === -1 ? minY : maxY
		};

		resizeCoeffs = bodies.map((body) =>
			body.map((point) => ({
				x:
					resizeDirection.x !== 0
						? ((point.x - mouseStartPos.x) / width) * resizeDirection.x + 1
						: 0,
				y:
					resizeDirection.y !== 0
						? ((point.y - mouseStartPos.y) / height) * resizeDirection.y + 1
						: 0
			}))
		);
		resizeStartPositions = copyPositions();

		isMouseDown = true;
	};

	const handleMouseUp = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (!isMouseDown) return;
		isRotating = false;
		isMoving = false;
		isMouseDown = false;

		if (optionsState.autoResample)
			bodies = resampleCellBodies(bodies, optionsState.resampleSegmentLength);
		pushLocalState();
	};

	const handleMouseMove = (e: MouseEvent) => {
		if (!isMouseDown) return;

		e.preventDefault();
		e.stopPropagation();

		if (!svgElement) return;
		const mouseViewBox = getPointerViewBoxCoords(e, svgElement);

		if (isRotating) {
			const mouseAngle =
				Math.atan2(mouseViewBox.y - midY, mouseViewBox.x - midX) -
				Math.atan2(mouseStartPos.y - midY, mouseStartPos.x - midX);

			// TODO: maybe optimize reactivity updates
			bodies.forEach((body, bodyIndex) => {
				body.forEach((point, pointIndex) => {
					const coeff = rotateCoeffs[bodyIndex][pointIndex];
					const angle = coeff.angle + mouseAngle;
					point.x = midX + Math.cos(angle) * coeff.dist;
					point.y = midY + Math.sin(angle) * coeff.dist;
				});
			});
			return;
		}

		if (isMoving) {
			const deltaX = mouseViewBox.x - mouseStartPos.x;
			const deltaY = mouseViewBox.y - mouseStartPos.y;
			bodies.forEach((body, bodyIndex) => {
				body.forEach((point, pointIndex) => {
					point.x = moveStartPositions[bodyIndex][pointIndex].x + deltaX;
					point.y = moveStartPositions[bodyIndex][pointIndex].y + deltaY;
				});
			});
			return;
		}

		bodies.forEach((body, bodyIndex) => {
			body.forEach((point, pointIndex) => {
				const coeff = resizeCoeffs[bodyIndex][pointIndex];
				point.x =
					resizeStartPositions[bodyIndex][pointIndex].x +
					(mouseViewBox.x - mouseStartPos.x) * coeff.x;
				point.y =
					resizeStartPositions[bodyIndex][pointIndex].y +
					(mouseViewBox.y - mouseStartPos.y) * coeff.y;
			});
		});
	};
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
		x={minX}
		y={minY}
		width={maxX - minX}
		height={maxY - minY}
		fill="transparent"
		stroke="none"
		cursor="move"
	/>
	{#if !isMouseDown}
		<!-- rotate -->
		<path
			id="hdl_r"
			d={`M${midX - size * 2},${minY - 2} Q${midX} ${minY - 2 - size},${midX + size * 2} ${minY - 2}`}
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
			x1={minX}
			y1={minY}
			x2={maxX}
			y2={minY}
			stroke={color2}
			stroke-width={size}
			cursor="ns-resize"
		/>
		<!-- bottom -->
		<line
			id="hdl_0:1"
			x1={minX}
			y1={maxY}
			x2={maxX}
			y2={maxY}
			stroke={color2}
			stroke-width={size}
			cursor="ns-resize"
		/>
		<!-- left -->
		<line
			id="hdl_-1:0"
			x1={minX}
			y1={minY}
			x2={minX}
			y2={maxY}
			stroke={color2}
			stroke-width={size}
			cursor="ew-resize"
		/>
		<!-- right -->
		<line
			id="hdl_1:0"
			x1={maxX}
			y1={minY}
			x2={maxX}
			y2={maxY}
			stroke={color2}
			stroke-width={size}
			cursor="ew-resize"
		/>

		<!-- top left -->
		<rect
			id="hdl_-1:-1"
			x={minX - size}
			y={minY - size}
			width={size * 2}
			height={size * 2}
			fill={color1}
			cursor="nwse-resize"
		/>
		<!-- top right -->
		<rect
			id="hdl_1:-1"
			x={maxX - size}
			y={minY - size}
			width={size * 2}
			height={size * 2}
			fill={color1}
			cursor="nesw-resize"
		/>
		<!-- bottom left -->
		<rect
			id="hdl_-1:1"
			x={minX - size}
			y={maxY - size}
			width={size * 2}
			height={size * 2}
			fill={color1}
			cursor="nesw-resize"
		/>
		<!-- bottom right -->
		<rect
			id="hdl_1:1"
			x={maxX - size}
			y={maxY - size}
			width={size * 2}
			height={size * 2}
			fill={color1}
			cursor="nwse-resize"
		/>
	{/if}
</g>
