<script lang="ts">
	import { editorState } from '$lib/states/EditorState.svelte';
	import { inputState } from '$lib/states/InputState.svelte';
	import { optionsState } from '$lib/states/options.svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import type { Point } from '$lib/types/geometry.type';
	import { cellBodyToPath, getPointerViewBoxCoords } from '$lib/utils/display';
	import { resampleCellBodies } from '$lib/utils/geometry';
	import { overrideDisplayPointerWhile } from './interaction.svelte';
	import type { EditorToolProps } from './types';

	let { bodies = $bindable(), pushLocalState }: EditorToolProps = $props();

	let interactiveRoot: SVGGElement | undefined = $state();
	let svgElement = $derived(interactiveRoot?.ownerSVGElement);

	let isMouseDown = $state(false);
	let mouseStartPos: Point = $state.raw({ x: 0, y: 0 });

	// Per point in each body, captured at the start of a drag
	let coeffs: number[][] = $state.raw([]);
	let startPositions: Point[][] = [];

	const light = '#ffffff';
	const dark = '#0f172a';

	// One "screen unit" in viewBox coordinates: keeps the brush ring and markers crisp at any zoom.
	const u = $derived(100 / svgState.svgScalePercent);
	const hairline = $derived(u);
	const halo = $derived(3 * u);
	const markerRadius = $derived(1.75 * u);
	const markerStroke = $derived(0.75 * u);

	const radius = $derived(editorState.smoothRadius);
	// While dragging, the influence is frozen around the drag origin
	const brushCenter = $derived(isMouseDown ? mouseStartPos : inputState.lastPointerViewBoxCoords);

	const RADIUS_STEP = 1.08;
	const MIN_RADIUS = 1;
	const viewBox = $derived(svgState.svgViewBox);
	const maxRadius = $derived(Math.max(viewBox.width, viewBox.height) / 2);

	overrideDisplayPointerWhile(
		() => isMouseDown,
		(e) => handleMouseMove(e),
		(e) => handleMouseUp(e)
	);

	function handleMouseDown(e: MouseEvent) {
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
	}

	function handleMouseUp(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		if (!isMouseDown) return;
		isMouseDown = false;

		if (optionsState.autoResample)
			bodies = resampleCellBodies(bodies, optionsState.resampleSegmentLength);
		pushLocalState();
	}

	function handleMouseMove(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		if (!svgElement) return;

		// Also keeps inputState.lastPointerViewBoxCoords (the brush ring) updated
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
	}

	function handleWheel(e: WheelEvent) {
		// Ctrl+wheel is zoom, leave it to the display
		if (e.ctrlKey) return;

		e.preventDefault();
		e.stopPropagation();
		const factor = e.deltaY > 0 ? 1 / RADIUS_STEP : RADIUS_STEP;
		editorState.smoothRadius = Math.min(
			maxRadius,
			Math.max(MIN_RADIUS, editorState.smoothRadius * factor)
		);
	}
</script>

{#snippet vertexMarkers(opacityOf: (bodyIndex: number, pointIndex: number) => number)}
	{#each bodies as body, bodyIndex (bodyIndex)}
		{#each body as point, pointIndex (pointIndex)}
			{@const opacity = opacityOf(bodyIndex, pointIndex)}
			{#if opacity > 0}
				<circle
					cx={point.x}
					cy={point.y}
					r={markerRadius}
					fill={light}
					stroke={dark}
					stroke-width={markerStroke}
					{opacity}
				/>
			{/if}
		{/each}
	{/each}
{/snippet}

<defs>
	<!-- Luminance mask matching the linear falloff of the drag influence -->
	<radialGradient id="smooth-mask-gradient">
		<stop offset="0%" stop-color="white" />
		<stop offset="100%" stop-color="black" />
	</radialGradient>
	<radialGradient id="smooth-falloff-gradient">
		<stop offset="0%" stop-color={light} stop-opacity="0.35" />
		<stop offset="100%" stop-color={light} stop-opacity="0" />
	</radialGradient>
	<mask id="smooth-pointer-mask">
		<circle
			cx={brushCenter.x}
			cy={brushCenter.y}
			r={radius}
			fill="url('#smooth-mask-gradient')"
		/>
	</mask>
</defs>

<!-- Wheel anywhere over the frame changes the brush radius (Ctrl+wheel bubbles up to the display zoom) -->
<g role="presentation" onwheel={handleWheel}>
	<rect
		x={viewBox.minX}
		y={viewBox.minY}
		width={viewBox.width}
		height={viewBox.height}
		class="fill-transparent stroke-none"
	/>

	<!-- Hit targets: a band of the brush radius around each outline -->
	<g
		role="presentation"
		onmousedown={handleMouseDown}
		onmouseup={handleMouseUp}
		onmousemove={handleMouseMove}
		bind:this={interactiveRoot}
	>
		{#each bodies as body, i (i)}
			<path
				d={cellBodyToPath(body)}
				stroke-width={radius * 2}
				stroke-linejoin="round"
				stroke-linecap="round"
				class="cursor-crosshair fill-none stroke-transparent"
			/>
		{/each}
	</g>
</g>

<!-- Outline -->
<g pointer-events="none">
	{#each bodies as body, i (i)}
		<path
			id="body{i}"
			d={cellBodyToPath(body)}
			stroke={svgState.svgStroke}
			class="fill-none stroke-1 opacity-80"
		/>
	{/each}
</g>

<!-- Brush ring and the vertices under the brush -->
{#if inputState.pointerOverDisplay || isMouseDown}
	<g pointer-events="none">
		<circle
			cx={brushCenter.x}
			cy={brushCenter.y}
			r={radius}
			fill="url('#smooth-falloff-gradient')"
		/>
		<circle
			cx={brushCenter.x}
			cy={brushCenter.y}
			r={radius}
			fill="none"
			stroke={dark}
			stroke-width={halo}
			opacity="0.65"
		/>
		<circle
			cx={brushCenter.x}
			cy={brushCenter.y}
			r={radius}
			fill="none"
			stroke={light}
			stroke-width={hairline}
		/>

		{#if isMouseDown}
			<!-- Markers follow the moving points, faded by their frozen influence -->
			{@render vertexMarkers((bodyIndex, pointIndex) => coeffs[bodyIndex]?.[pointIndex] ?? 0)}
		{:else}
			<g mask="url(#smooth-pointer-mask)">
				{@render vertexMarkers(() => 1)}
			</g>
		{/if}
	</g>
{/if}
