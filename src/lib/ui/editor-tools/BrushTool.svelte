<script lang="ts">
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { editorState } from '$lib/states/EditorState.svelte';
	import { inputState } from '$lib/states/InputState.svelte';
	import { projectState } from '$lib/states/ProjectState.svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import { zoomState } from '$lib/states/zoom.svelte';
	import type { RLEType, TrackType } from '$lib/types/annotation.type';
	import type { Point } from '$lib/types/geometry.type';
	import { getPointerViewBoxCoords, polylineToPath } from '$lib/utils/display';
	import { startDrag } from '$lib/utils/drag';
	import { getPolygonsBoundsCached } from '$lib/utils/geometry';
	import { clamp } from '$lib/utils/math';
	import { maskToRle, rleToMask, rleToPolygons } from '$lib/utils/rle';
	import { cellsLabel, newCell } from '$lib/utils/tracks';
	import type { EditorToolProps } from './types';
	import { PersistedState } from 'runed';
	import { toast } from 'svelte-sonner';

	let { frameIndex, cells }: EditorToolProps = $props();

	let root: SVGGElement | undefined = $state();

	// The brush's path in viewBox coordinates, only during a stroke
	let stroke: Point[] = $state.raw([]);
	let erasing = $state(false);

	const storedRadius = new PersistedState('editor.tools.brush.radius', 5, { syncTabs: false });
	const radius = $derived(storedRadius.current);
	const pointerHere = $derived(inputState.pointer?.frameIndex === frameIndex);

	const light = '#ffffff';
	const dark = '#0f172a';
	const u = $derived(zoomState.screenUnit);

	const RADIUS_STEP = 1.08;
	const MIN_RADIUS = 1;
	const viewBox = $derived(svgState.svgViewBox);
	const maxRadius = $derived(Math.max(viewBox.width, viewBox.height) / 2);

	// Pointer positions closer than this to the previous one are skipped
	const MIN_STEP = 0.5;

	function handlePointerDown(e: PointerEvent) {
		if ((e.button !== 0 && e.button !== 2) || !root?.ownerSVGElement) return;

		e.preventDefault();
		e.stopPropagation();
		if (!startDrag(root, e, { onMove: handleDragMove, onEnd: handleDragEnd })) return;

		erasing = e.button === 2;
		stroke = [getPointerViewBoxCoords(e, root.ownerSVGElement)];
	}

	function handleDragMove(e: PointerEvent) {
		if (!root?.ownerSVGElement || stroke.length === 0) return;
		const point = getPointerViewBoxCoords(e, root.ownerSVGElement);
		const last = stroke[stroke.length - 1];
		if (Math.hypot(point.x - last.x, point.y - last.y) >= MIN_STEP) stroke = [...stroke, point];
	}

	function handleDragEnd() {
		const painted = stroke;
		stroke = [];
		if (painted.length === 0) return;
		if (erasing) erase(painted);
		else paint(painted);
	}

	/** Sets the mask's pixels within the radius of the stroke to `value`; true if any changed. */
	function stamp(
		mask: Uint8Array,
		[height, width]: [number, number],
		path: Point[],
		value: 0 | 1
	) {
		let changed = false;
		for (let i = 0; i < path.length; i++) {
			const a = path[Math.max(i - 1, 0)];
			const b = path[i];
			const [dx, dy] = [b.x - a.x, b.y - a.y];
			const length2 = dx * dx + dy * dy;
			const minX = Math.max(0, Math.ceil(Math.min(a.x, b.x) - radius));
			const maxX = Math.min(width - 1, Math.floor(Math.max(a.x, b.x) + radius));
			const minY = Math.max(0, Math.ceil(Math.min(a.y, b.y) - radius));
			const maxY = Math.min(height - 1, Math.floor(Math.max(a.y, b.y) + radius));
			for (let y = minY; y <= maxY; y++) {
				for (let x = minX; x <= maxX; x++) {
					// The distance from the pixel to the segment
					const t =
						length2 > 0 ? clamp(((x - a.x) * dx + (y - a.y) * dy) / length2, 0, 1) : 0;
					const [ex, ey] = [a.x + t * dx - x, a.y + t * dy - y];
					if (ex * ex + ey * ey > radius * radius) continue;
					const index = y * width + x;
					if (mask[index] !== value) {
						mask[index] = value;
						changed = true;
					}
				}
			}
		}
		return changed;
	}

	// Into the selected cell, or a new one while nothing is selected here
	function paint(path: Point[]) {
		if (cells.length > 1) {
			toast('Select one cell to paint into, or none for a new one');
			return;
		}

		const [cell] = cells;
		if (cell) {
			const size = cell.SegmentationRLE.size;
			const mask = rleToMask(cell.SegmentationRLE);
			if (!stamp(mask, size, path, 1)) return;
			annotationState.setMasks(
				[{ cell, mask: maskToRle(mask, size) }],
				`Paint cell ${cell.ObjectID}`
			);
			return;
		}

		const metadata = projectState.videoMetadata;
		if (!metadata) return;
		const size: [number, number] = [metadata.height, metadata.width];
		const mask = new Uint8Array(size[0] * size[1]);
		if (!stamp(mask, size, path, 1)) return;
		const added = annotationState.addCell((tracks) =>
			newCell(frameIndex, tracks, maskToRle(mask, size))
		);
		if (added) editorState.select(added);
	}

	// From the selected cells, or every cell of the frame while nothing is selected here
	function erase(path: Point[]) {
		const targets = cells.length > 0 ? cells : (annotationState.getFrame(frameIndex) ?? []);
		const xs = path.map(({ x }) => x);
		const ys = path.map(({ y }) => y);
		const [minX, maxX] = [Math.min(...xs) - radius, Math.max(...xs) + radius];
		const [minY, maxY] = [Math.min(...ys) - radius, Math.max(...ys) + radius];

		const updates: { cell: TrackType; mask: RLEType | null }[] = [];
		for (const cell of targets) {
			const b = getPolygonsBoundsCached(rleToPolygons(cell.SegmentationRLE));
			if (b.maxX < minX || b.minX > maxX || b.maxY < minY || b.minY > maxY) continue;

			const size = cell.SegmentationRLE.size;
			const mask = rleToMask(cell.SegmentationRLE);
			if (!stamp(mask, size, path, 0)) continue;
			// Erased entirely, the cell goes
			updates.push({ cell, mask: mask.includes(1) ? maskToRle(mask, size) : null });
		}
		if (updates.length === 0) return;
		annotationState.setMasks(
			updates,
			`Erase from ${cellsLabel(updates.map(({ cell }) => cell))}`
		);
	}

	function handleWheel(e: WheelEvent) {
		if (e.ctrlKey) return; // Ctrl+wheel is the display's zoom

		e.preventDefault();
		e.stopPropagation();
		const factor = e.deltaY > 0 ? 1 / RADIUS_STEP : RADIUS_STEP;
		storedRadius.current = clamp(radius * factor, MIN_RADIUS, maxRadius);
	}

	const strokePath = $derived(polylineToPath(stroke));
	const brush = $derived(stroke.at(-1) ?? inputState.pointer);
</script>

<!-- Hit target: the left button paints anywhere over the frame, the right one erases; the wheel sizes the brush -->
<g role="presentation" onpointerdown={handlePointerDown} onwheel={handleWheel} bind:this={root}>
	<rect
		x={viewBox.minX}
		y={viewBox.minY}
		width={viewBox.width}
		height={viewBox.height}
		class="cursor-crosshair fill-transparent stroke-none"
	/>
</g>

<!-- The stroke in progress: a zero-length path still draws its round cap -->
{#if stroke.length > 0}
	<path
		pointer-events="none"
		d={strokePath}
		stroke={erasing ? dark : light}
		stroke-width={radius * 2}
		stroke-linecap="round"
		stroke-linejoin="round"
		fill="none"
		opacity={erasing ? 0.6 : 0.45}
	/>
{/if}

<!-- The brush ring -->
{#if brush && (pointerHere || stroke.length > 0)}
	<g pointer-events="none">
		<circle
			cx={brush.x}
			cy={brush.y}
			r={radius}
			fill="none"
			stroke={dark}
			stroke-width={3 * u}
			opacity="0.65"
		/>
		<circle cx={brush.x} cy={brush.y} r={radius} fill="none" stroke={light} stroke-width={u} />
	</g>
{/if}
