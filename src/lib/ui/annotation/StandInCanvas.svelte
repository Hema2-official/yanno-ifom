<script lang="ts">
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { editorState } from '$lib/states/EditorState.svelte';
	import { keybindings } from '$lib/states/KeybindingState.svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import { videoDisplayState } from '$lib/states/VideoDisplayState.svelte';
	import type { FrameLayout, Placement } from '$lib/utils/layout';
	import {
		drawOutlines,
		drawStandIns,
		MAX_SNAPSHOT_SIZE,
		type OutlineLook,
		type StandIn,
		type StandInView
	} from '$lib/utils/snapshots';

	type Props = {
		layout: FrameLayout;
		placement: Placement;
		/** The shown frames, by their offset in the window. */
		frames: number[];
		/** Their baked images, null where one isn't ready. */
		images: (CanvasImageSource | null)[];
		annotationOpacity: number;
		view: StandInView;
	};

	let { layout, placement, frames, images, annotationOpacity, view }: Props = $props();

	const vb = $derived(svgState.svgViewBox);

	// Firefox shows new canvases with a pause, but raises faint ones at once
	const READY_OPACITY = 0.01;

	/** The frames' cells on canvases, as sharp as the frames are shown when this one appears. */
	const drawOutlineSnapshots = (canvas: HTMLCanvasElement) => {
		const style = getComputedStyle(canvas);
		const hideLabels = keybindings.isHeld('display.hideLabels');
		const scale = untrack(() =>
			Math.min(
				placement.scale * devicePixelRatio,
				MAX_SNAPSHOT_SIZE / Math.max(vb.width, vb.height)
			)
		);
		const size = { width: vb.width, height: vb.height, scale };
		const look: OutlineLook = {
			...svgState.cellLook,
			selectedStroke: style.getPropertyValue('--accent-color').trim(),
			isSelected: (cell) => editorState.isSelected(cell),
			label: (cell) => (hideLabels ? null : svgState.cellLabel(cell)),
			fontFamily: style.fontFamily
		};
		return frames.map((frameIndex) => {
			const outlines = document.createElement('canvas');
			drawOutlines(outlines, size, annotationState.getFrame(frameIndex) ?? [], look);
			return outlines;
		});
	};

	const draw: Attachment<HTMLCanvasElement> = (canvas) => {
		// Drawn once, then on changes to the cells, like the svg tiles
		const outlines = drawOutlineSnapshots(canvas);

		$effect(() => {
			// In the tiles' draw order: all images under all outlines
			const imageStandIns = layout.tiles.flatMap(({ offset, fade }): StandIn[] => {
				const image = images[offset];
				return image ? [{ image, matrix: placement.matrices[offset], opacity: fade }] : [];
			});
			const outlineStandIns = layout.tiles.map(({ offset }) => ({
				image: outlines[offset],
				matrix: placement.matrices[offset],
				opacity: annotationOpacity
			}));
			drawStandIns(canvas, imageStandIns.concat(outlineStandIns), vb, view);
		});
	};
</script>

<!-- One canvas standing in for all the tiles, so the browser composites a single layer however large the frames -->
<canvas
	class="pointer-events-none absolute inset-0 size-full"
	style:opacity={videoDisplayState.isTurning ? undefined : READY_OPACITY}
	{@attach draw}
></canvas>
