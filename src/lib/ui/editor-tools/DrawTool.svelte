<script lang="ts">
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { editorState } from '$lib/states/EditorState.svelte';
	import { optionsState } from '$lib/states/options.svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import { zoomState } from '$lib/states/zoom.svelte';
	import type { Polygon } from '$lib/types/geometry.type';
	import { cellBodyToPath, getPointerViewBoxCoords } from '$lib/utils/display';
	import { resampleCellBody } from '$lib/utils/geometry';
	import { polygonsToRle } from '$lib/utils/rle';
	import { newCell } from '$lib/utils/tracks';
	import { startDrag } from '$lib/utils/drag';
	import type { EditorToolProps } from './types';

	let { frameIndex }: EditorToolProps = $props();

	let root: SVGGElement | undefined = $state();

	// The outline being drawn, in viewBox coordinates
	let stroke: Polygon = $state.raw([]);

	const light = '#ffffff';
	const dark = '#0f172a';
	const u = $derived(zoomState.screenUnit);
	const viewBox = $derived(svgState.svgViewBox);

	// Pointer positions closer than this to the previous vertex are skipped
	const MIN_VERTEX_DISTANCE = 0.5;

	function handlePointerDown(e: PointerEvent) {
		if (e.button !== 0 || !root?.ownerSVGElement) return;

		e.preventDefault();
		e.stopPropagation();
		if (!startDrag(root, e, { onMove: handleDragMove, onEnd: handleDragEnd })) return;

		stroke = [getPointerViewBoxCoords(e, root.ownerSVGElement)];
	}

	function handleDragMove(e: PointerEvent) {
		if (!root?.ownerSVGElement || stroke.length === 0) return;
		const point = getPointerViewBoxCoords(e, root.ownerSVGElement);
		const last = stroke[stroke.length - 1];
		if (Math.hypot(point.x - last.x, point.y - last.y) >= MIN_VERTEX_DISTANCE) {
			stroke = [...stroke, point];
		}
	}

	function handleDragEnd() {
		const drawn = stroke;
		stroke = [];

		const metadata = projectState.videoMetadata;
		// Anything shorter is an accidental click
		if (drawn.length < 3 || !metadata) return;

		const outline = optionsState.autoResample.current
			? resampleCellBody(drawn, optionsState.resampleSegmentLength.current)
			: drawn;
		const cell = annotationState.addCell((tracks) =>
			newCell(frameIndex, tracks, polygonsToRle([outline], [metadata.height, metadata.width]))
		);
		if (cell) editorState.select(cell);
	}
</script>

<!-- Hit target: a drag anywhere over the frame draws an outline -->
<g role="presentation" onpointerdown={handlePointerDown} bind:this={root}>
	<rect
		x={viewBox.minX}
		y={viewBox.minY}
		width={viewBox.width}
		height={viewBox.height}
		class="cursor-crosshair fill-transparent stroke-none"
	/>
</g>

<!-- The outline in progress -->
{#if stroke.length > 1}
	<g pointer-events="none">
		<path
			d={cellBodyToPath(stroke)}
			stroke={dark}
			stroke-width={3 * u}
			class="fill-none opacity-60"
		/>
		<path d={cellBodyToPath(stroke)} stroke={light} stroke-width={u} class="fill-none" />
	</g>
{/if}
