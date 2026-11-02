<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { editorState } from '$lib/states/EditorState.svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import { zoomState } from '$lib/states/zoom.svelte';
	import type { Point } from '$lib/types/geometry.type';
	import { getPointerViewBoxCoords, polylineToPath } from '$lib/utils/display';
	import { startGesture } from '$lib/ui/annotation/gestures';
	import { getPolygonsBounds, getPolygonsBoundsCached } from '$lib/utils/geometry';
	import { cutMask } from '$lib/utils/masks';
	import { rleToPolygons } from '$lib/utils/rle';
	import type { EditorToolProps } from './types';

	let { frameIndex, cells }: EditorToolProps = $props();

	let root: SVGGElement | undefined = $state();

	// The cut being drawn, in viewBox coordinates
	let line: Point[] = $state.raw([]);

	const light = '#ffffff';
	const dark = '#0f172a';
	const u = $derived(zoomState.screenUnit);
	const viewBox = $derived(svgState.svgViewBox);

	// Pointer positions closer than this to the previous point are skipped
	const MIN_POINT_DISTANCE = 0.5;

	function handlePointerDown(e: PointerEvent) {
		if (e.button !== 0 || !root) return;

		e.preventDefault();
		e.stopPropagation();
		startGesture(root, e, { onStart: begin, onMove: handleDragMove, onEnd: handleDragEnd });
	}

	function begin(press: PointerEvent) {
		if (!root?.ownerSVGElement) return;
		line = [getPointerViewBoxCoords(press, root.ownerSVGElement)];
	}

	function handleDragMove(e: PointerEvent) {
		if (!root?.ownerSVGElement || line.length === 0) return;
		const point = getPointerViewBoxCoords(e, root.ownerSVGElement);
		const last = line[line.length - 1];
		if (Math.hypot(point.x - last.x, point.y - last.y) >= MIN_POINT_DISTANCE) {
			line = [...line, point];
		}
	}

	// Through the selected cells, or every cell of the frame while nothing is selected here
	function handleDragEnd(e: PointerEvent) {
		const cut = line;
		line = [];
		if (e.type !== 'pointerup' || cut.length < 2) return;

		const reach = getPolygonsBounds([cut]);
		const targets = cells.length > 0 ? cells : (annotationState.getFrame(frameIndex) ?? []);
		const splits = targets.flatMap((cell) => {
			const b = getPolygonsBoundsCached(rleToPolygons(cell.SegmentationRLE));
			const apart =
				b.maxX < reach.minX - 1 ||
				b.minX > reach.maxX + 1 ||
				b.maxY < reach.minY - 1 ||
				b.minY > reach.maxY + 1;
			const pieces = apart ? null : cutMask(cell.SegmentationRLE, cut);
			return pieces ? [{ cell, pieces }] : [];
		});
		if (splits.length === 0) {
			toast("The line doesn't cut a cell in two");
			return;
		}

		const pieces = annotationState.splitCells(splits);
		if (pieces) editorState.selectAll(pieces);
	}
</script>

<!-- Hit target: a drag anywhere over the frame draws a cut -->
<g role="presentation" onpointerdown={handlePointerDown} bind:this={root}>
	<rect
		x={viewBox.minX}
		y={viewBox.minY}
		width={viewBox.width}
		height={viewBox.height}
		class="cursor-crosshair fill-transparent stroke-none"
	/>
</g>

<!-- The cut in progress -->
{#if line.length > 1}
	<g pointer-events="none">
		<path
			d={polylineToPath(line)}
			stroke={dark}
			stroke-width={3 * u}
			class="fill-none opacity-60"
		/>
		<path d={polylineToPath(line)} stroke={light} stroke-width={u} class="fill-none" />
	</g>
{/if}
