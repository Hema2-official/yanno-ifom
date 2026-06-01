<script lang="ts">
	import {
		displayMouseLeaveHandler,
		displayMouseMoveHandler,
		displayMouseUpHandler
	} from '$lib/stores/input';
	import { optionsState } from '$lib/states/options.svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import type { Point } from '$lib/types/editor.type';
	import { cellBodyToPath, getPointerViewBoxCoords } from '$lib/utils/display';
	import { resampleCellBodies } from '$lib/utils/geometry';
	import { P } from '$lib/utils/pattern';
	import type { EditorToolProps } from './types';
	import { getMax, getMin } from '$lib/utils/data.svelte';

	let { bodies, pushLocalState }: EditorToolProps = $props();

	let interactiveRoot: SVGElement | undefined;
	let svgElement = $derived(interactiveRoot?.ownerSVGElement);

	let isMouseDown = $state(false);
	let isRotating = $state(false);
	let isMoving = $state(false);

	$effect(() => {
		if (isMouseDown) {
			$displayMouseMoveHandler = handleMouseMove;
			$displayMouseUpHandler = handleMouseUp;
			$displayMouseLeaveHandler = handleMouseUp;
		} else {
			$displayMouseMoveHandler = null;
			$displayMouseUpHandler = null;
			$displayMouseLeaveHandler = null;
		}
	});

	let mouseStartPos: Point;

	// For each point in each body
	// rotateCoeffs[bodyIndex][pointIndex] = { dist, angle }
	let rotateCoeffs: { dist: number; angle: number }[][] = [];

	// For each point in each body
	let moveStartPositons: Point[][] = [];

	let resizeDirection: Point = { x: 0, y: 0 };
	let resizeCoeffs: Point[][] = [];
	let resizeStartPositons: Point[][] = [];

	const color1 = 'white';
	const color2 = 'gray';

	let minX = $derived(getMin($bodies.map((body) => getMin(body.map((point) => point.x)))));
	let minY = $derived(getMin($bodies.map((body) => getMin(body.map((point) => point.y)))));
	let maxX = $derived(getMax($bodies.map((body) => getMax(body.map((point) => point.x)))));
	let maxY = $derived(getMax($bodies.map((body) => getMax(body.map((point) => point.y)))));
	let midX = $derived((minX + maxX) / 2);
	let midY = $derived((minY + maxY) / 2);
	let size = $derived(400 / svgState.svgScalePercent);

	const handleMouseDown = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (!svgElement) return;

		const target = e.target as HTMLElement;
		if (!target.id.startsWith('hdl')) return;

		// Rotate
		if (target.id === 'hdl_r') {
			mouseStartPos = getPointerViewBoxCoords(e, svgElement);

			rotateCoeffs = $bodies.map((body) =>
				body.map((point) => {
					const dx = point.x - midX;
					const dy = point.y - midY;
					return {
						dist: Math.sqrt(dx * dx + dy * dy),
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

			moveStartPositons = $bodies.map((body) =>
				body.map((point) => ({ x: point.x, y: point.y }))
			);

			isMoving = true;
			isMouseDown = true;
			return;
		}

		// Resize
		const width = maxX - minX;
		const height = maxY - minY;

		[resizeDirection.x, resizeDirection.y] = P('hdl_#:#').match(target.id);

		mouseStartPos = {
			x: resizeDirection.x === 0 ? midX : resizeDirection.x === -1 ? minX : maxX,
			y: resizeDirection.y === 0 ? midY : resizeDirection.y === -1 ? minY : maxY
		};

		resizeCoeffs = $bodies.map((body) =>
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

		// TODO: just copy
		resizeStartPositons = $bodies.map((body) =>
			body.map((point) => ({ x: point.x, y: point.y }))
		);

		isMouseDown = true;
	};

	const handleMouseUp = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		isRotating = false;
		isMoving = false;
		isMouseDown = false;

		if (optionsState.autoResample)
			bodies.update((_bodies) =>
				resampleCellBodies(_bodies, optionsState.resampleSegmentLength)
			);
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

			bodies.update((_bodies) => {
				_bodies.forEach((body, bodyIndex) => {
					body.forEach((point, pointIndex) => {
						const coeff = rotateCoeffs[bodyIndex][pointIndex];
						const angle = coeff.angle + mouseAngle;
						point.x = midX + Math.cos(angle) * coeff.dist;
						point.y = midY + Math.sin(angle) * coeff.dist;
					});
				});
				return _bodies;
			});
			return;
		}

		if (isMoving) {
			bodies.update((_bodies) => {
				_bodies.forEach((body, bodyIndex) => {
					body.forEach((point, pointIndex) => {
						point.x =
							moveStartPositons[bodyIndex][pointIndex].x +
							mouseViewBox.x -
							mouseStartPos.x;
						point.y =
							moveStartPositons[bodyIndex][pointIndex].y +
							mouseViewBox.y -
							mouseStartPos.y;
					});
				});
				return _bodies;
			});
			return;
		}

		bodies.update((_bodies) => {
			_bodies.forEach((body, bodyIndex) => {
				body.forEach((point, pointIndex) => {
					point.x =
						resizeStartPositons[bodyIndex][pointIndex].x +
						(mouseViewBox.x - mouseStartPos.x) * resizeCoeffs[bodyIndex][pointIndex].x;
					point.y =
						resizeStartPositons[bodyIndex][pointIndex].y +
						(mouseViewBox.y - mouseStartPos.y) * resizeCoeffs[bodyIndex][pointIndex].y;
				});
			});
			return _bodies;
		});
	};
</script>

<!-- Non-interactive elements -->
{#each $bodies as body, i}
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
		class="whole"
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
			class="whole"
			d={`M${midX - size * 2},${minY - 2} Q${midX} ${minY - 2 - size},${midX + size * 2} ${minY - 2}`}
			fill="transparent"
			stroke={color1}
			stroke-width={size * 2}
			stroke-linecap="round"
			cursor="ew-resize"
		/>
	{/if}
	{#if (isMouseDown && !isRotating && !isMoving) || !isMouseDown}
		<!-- top -->
		<line
			id="hdl_0:-1"
			class="whole"
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
			class="whole"
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
			class="whole"
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
			class="whole"
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
			class="whole"
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
			class="whole"
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
			class="whole"
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
			class="whole"
			x={maxX - size}
			y={maxY - size}
			width={size * 2}
			height={size * 2}
			fill={color1}
			cursor="nwse-resize"
		/>
	{/if}
</g>
