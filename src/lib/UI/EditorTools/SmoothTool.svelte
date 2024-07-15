<script lang="ts">
	import { hoverElementsShown, lastPointerViewBoxCoords, smoothRadius } from '$lib/stores/editor';
	import {
		displayMouseLeaveHandler,
		displayMouseMoveHandler,
		displayMouseUpHandler,
		modifierKeys
	} from '$lib/stores/input';
	import { autoResample } from '$lib/stores/options';
	import type { CellBodyType } from '$lib/types/annotation.type';
	import type { Point } from '$lib/types/editor.type';
	import { cellBodyToPath, getPointerViewBoxCoords } from '$lib/utils/display';
	import { resampleCellBodies } from '$lib/utils/geometry';
	import type { Writable } from 'svelte/store';

	export let bodies: Writable<CellBodyType[]>;
	export let pushLocalState: () => void;

	let interactiveRoot: SVGElement;
	$: svgElement = interactiveRoot?.ownerSVGElement;

	let mouseStartPos: Point;

	// For each point in each body
	let coeffs: number[][] = [];
	let startPositons: Point[][] = [];

	let isMouseDown = false;

	$: if (isMouseDown) {
		$displayMouseMoveHandler = handleMouseMove;
		$displayMouseUpHandler = handleMouseUp;
		$displayMouseLeaveHandler = handleMouseUp;
	} else {
		$displayMouseMoveHandler = null;
		$displayMouseUpHandler = null;
		$displayMouseLeaveHandler = null;
	}

	const handleMouseDown = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (!svgElement) return;
		mouseStartPos = getPointerViewBoxCoords(e, svgElement);

		coeffs = $bodies.map((body) =>
			body.x.map((x, i) => {
				const dx = x - mouseStartPos.x;
				const dy = body.y[i] - mouseStartPos.y;
				const dist = Math.sqrt(dx * dx + dy * dy);
				return 1 - Math.min(dist / $smoothRadius, 1);
			})
		);

		startPositons = $bodies.map((body) => body.x.map((x, i) => ({ x, y: body.y[i] })));

		// cell.x.forEach((x, i) => {
		//     const dx = x - mouseStartPos.x;
		//     const dy = cell.y[i] - mouseStartPos.y;
		//     const dist = Math.sqrt(dx * dx + dy * dy);
		//     const co = 1 - dist / $smoothRadius;
		//     if (dist < $smoothRadius)
		//         relations.push({
		//             index: i,
		//             coeff: { x: co, y: co },
		//             startingPos: { x: x, y: cell.y[i] }
		//         });
		// });
		isMouseDown = true;
	};

	const handleMouseUp = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		isMouseDown = false;

		if ($autoResample) bodies.update((_bodies) => resampleCellBodies(_bodies));
		pushLocalState();
	};

	const handleMouseMove = (e: MouseEvent) => {
		if (!svgElement) return;

		// Update viewbox coord values
		getPointerViewBoxCoords(e, svgElement);

		e.preventDefault();
		e.stopPropagation();

		if (!isMouseDown) return;

		const mouseViewBox = getPointerViewBoxCoords(e, svgElement);

		bodies.update((_bodies) => {
			_bodies.forEach((body, bodyIndex) => {
				body.x.forEach((x, i) => {
					body.x[i] =
						startPositons[bodyIndex][i].x +
						(mouseViewBox.x - mouseStartPos.x) * coeffs[bodyIndex][i];
					body.y[i] =
						startPositons[bodyIndex][i].y +
						(mouseViewBox.y - mouseStartPos.y) * coeffs[bodyIndex][i];
				});
			});
			return _bodies;
		});
	};

	const handleWheel = (e: WheelEvent) => {
		// Check if the user is zooming
		if ($modifierKeys.ctrl) return;

		e.preventDefault();
		e.stopPropagation();
		const delta = e.deltaY > 0 ? 1 : -1;
		$smoothRadius = Math.max(1, $smoothRadius - delta);
		console.log('$smoothRadius:', $smoothRadius);
	};
</script>

<defs>
	<radialGradient id="maskRadialGradient">
		<stop offset="0%" stop-color="white" />
		<stop offset="100%" stop-color="black" />
	</radialGradient>
	<radialGradient id="handleRadialGradient" spreadMethod="reflect">
		<stop offset="25%" stop-color="white" stop-opacity="0" />
		<stop offset="100%" stop-color="white" stop-opacity="0.4" />
	</radialGradient>
</defs>

<mask id="pointerMaskCircle">
	<circle
		cx={$lastPointerViewBoxCoords.x}
		cy={$lastPointerViewBoxCoords.y}
		r={$smoothRadius}
		fill="url('#maskRadialGradient')"
	/>
</mask>

<!-- Interactive elements -->
<g
	role="presentation"
	on:mousedown={handleMouseDown}
	on:mouseup={handleMouseUp}
	on:mousemove={handleMouseMove}
	on:wheel={handleWheel}
	bind:this={interactiveRoot}
>
	{#each $bodies as body}
		<path
			class="smooth-tool"
			d={cellBodyToPath(body)}
			fill="none"
			stroke="url('#handleRadialGradient')"
			stroke-width={$smoothRadius * 2}
			opacity="1"
		/>
	{/each}
</g>

<!-- Non-interactive elements on top -->

{#each $bodies as body}
	<path
		class="smooth-tool no-interact"
		d={cellBodyToPath(body)}
		fill="none"
		stroke="black"
		stroke-width="2"
		opacity="0.6"
	/>
{/each}

{#if $hoverElementsShown}
	<g mask="url(#pointerMaskCircle)">
		{#each $bodies as body}
			{#each body.x as x, i}
				{@const halfSize = 0.25}
				<path
					class="smooth-tool no-interact"
					d={`M${x - halfSize},${body.y[i] - halfSize} L${x + halfSize},${body.y[i] + halfSize}
                    M${x + halfSize},${body.y[i] - halfSize} L${x - halfSize},${body.y[i] + halfSize}`}
					stroke="white"
					stroke-width={halfSize / 1.5}
				/>
			{/each}
		{/each}
	</g>
{/if}

<style lang="scss">
	.smooth-tool {
		cursor: move;
	}
	.no-interact {
		pointer-events: none;
	}
</style>
