<script lang="ts">
	import { editorState } from '$lib/states/EditorState.svelte';
	import { inputState } from '$lib/states/InputState.svelte';
	import { optionsState } from '$lib/states/options.svelte';
	import type { Point } from '$lib/types/geometry.type';
	import { cellBodyToPath, getPointerViewBoxCoords } from '$lib/utils/display';
	import { resampleCellBodies } from '$lib/utils/geometry';
	import { overrideDisplayPointerWhile } from './interaction.svelte';
	import type { EditorToolProps } from './types';

	let { bodies = $bindable(), pushLocalState }: EditorToolProps = $props();

	let interactiveRoot: SVGGElement | undefined = $state();
	let svgElement = $derived(interactiveRoot?.ownerSVGElement);

	let isMouseDown = $state(false);
	let mouseStartPos: Point = { x: 0, y: 0 };

	// Per point in each body, captured at the start of a drag
	let coeffs: number[][] = [];
	let startPositions: Point[][] = [];

	overrideDisplayPointerWhile(
		() => isMouseDown,
		(e) => handleMouseMove(e),
		(e) => handleMouseUp(e)
	);

	const handleMouseDown = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (!svgElement) return;
		mouseStartPos = getPointerViewBoxCoords(e, svgElement);

		// Influence of the drag on each point falls off linearly with the
		// point's distance from the drag origin
		coeffs = bodies.map((body) =>
			body.map((point) => {
				const dist = Math.hypot(point.x - mouseStartPos.x, point.y - mouseStartPos.y);
				return 1 - Math.min(dist / editorState.smoothRadius, 1);
			})
		);
		startPositions = bodies.map((body) => body.map((point) => ({ x: point.x, y: point.y })));

		isMouseDown = true;
	};

	const handleMouseUp = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (!isMouseDown) return;
		isMouseDown = false;

		if (optionsState.autoResample)
			bodies = resampleCellBodies(bodies, optionsState.resampleSegmentLength);
		pushLocalState();
	};

	const handleMouseMove = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (!svgElement) return;

		// Also keeps inputState.lastPointerViewBoxCoords (the hover circle) updated
		const mouseViewBox = getPointerViewBoxCoords(e, svgElement);

		if (!isMouseDown) return;

		const deltaX = mouseViewBox.x - mouseStartPos.x;
		const deltaY = mouseViewBox.y - mouseStartPos.y;
		bodies.forEach((body, bodyIndex) => {
			body.forEach((point, pointIndex) => {
				const coeff = coeffs[bodyIndex][pointIndex];
				point.x = startPositions[bodyIndex][pointIndex].x + deltaX * coeff;
				point.y = startPositions[bodyIndex][pointIndex].y + deltaY * coeff;
			});
		});
	};

	const handleWheel = (e: WheelEvent) => {
		// Ctrl+wheel is zoom, leave it to the display
		if (inputState.pressedKeys.has('Control')) return;

		e.preventDefault();
		e.stopPropagation();
		const delta = e.deltaY > 0 ? 1 : -1;
		editorState.smoothRadius = Math.max(1, editorState.smoothRadius - delta);
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
		cx={inputState.lastPointerViewBoxCoords.x}
		cy={inputState.lastPointerViewBoxCoords.y}
		r={editorState.smoothRadius}
		fill="url('#maskRadialGradient')"
	/>
</mask>

<!-- Interactive elements -->
<g
	role="presentation"
	onmousedown={handleMouseDown}
	onmouseup={handleMouseUp}
	onmousemove={handleMouseMove}
	onwheel={handleWheel}
	bind:this={interactiveRoot}
>
	{#each bodies as body, i (i)}
		<path
			class="smooth-tool"
			d={cellBodyToPath(body)}
			fill="none"
			stroke="url('#handleRadialGradient')"
			stroke-width={editorState.smoothRadius * 2}
			opacity="1"
		/>
	{/each}
</g>

<!-- Non-interactive elements on top -->
{#each bodies as body, i (i)}
	<path
		class="smooth-tool no-interact"
		d={cellBodyToPath(body)}
		fill="none"
		stroke="black"
		stroke-width="2"
		opacity="0.6"
	/>
{/each}

{#if inputState.pointerOverDisplay}
	<g mask="url(#pointerMaskCircle)">
		{#each bodies as body, bodyIndex (bodyIndex)}
			{#each body as point, pointIndex (pointIndex)}
				{@const halfSize = 0.25}
				<path
					class="smooth-tool no-interact"
					d={`M${point.x - halfSize},${point.y - halfSize} L${point.x + halfSize},${point.y + halfSize}
                    M${point.x + halfSize},${point.y - halfSize} L${point.x - halfSize},${point.y + halfSize}`}
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
