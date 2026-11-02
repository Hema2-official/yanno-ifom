<script module lang="ts">
	import type { Point } from '$lib/types/geometry.type';

	/** The arrow being dragged, in client coordinates: `Display` draws it over all the tiles. */
	export const ancestryDrag: { arrow: { from: Point; to: Point } | null } = $state({
		arrow: null
	});
</script>

<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';
	import { annotationState } from '$lib/states/AnnotationState.svelte';
	import { cellsAt, startGesture, type CellHit } from '$lib/ui/annotation/gestures';
	import type { ClientPoint } from '$lib/utils/display';
	import { cellCenter } from '$lib/utils/tracks';
	import type { EditorToolProps } from './types';

	// It finds the cells by the pointer, in whichever frame
	let {}: EditorToolProps = $props();

	/** The topmost tracked cell there, in whichever tile: the tool sees no others. */
	const trackedCellAt = (point: ClientPoint) =>
		cellsAt(point).find(({ cell }) => cell.TrackID !== null) ?? null;

	function clientCenter({ cell, tile }: CellHit): Point {
		const { x, y } = cellCenter(cell);
		return new DOMPoint(x, y).matrixTransform(tile.getScreenCTM() ?? undefined);
	}

	// A press on a tracked cell; a click there selects it, as under every tool
	function press(root: SVGGElement, e: PointerEvent) {
		const source = cellsAt(e)[0];
		if (e.button !== 0 || !source || source.cell.TrackID === null) return;

		e.preventDefault();
		e.stopPropagation();
		startGesture(root, e, {
			onMove(e) {
				const hit = trackedCellAt(e);
				const descendant = hit && hit.cell.TrackID !== source.cell.TrackID ? hit : null;
				ancestryDrag.arrow = {
					from: clientCenter(source),
					to: descendant ? clientCenter(descendant) : { x: e.clientX, y: e.clientY }
				};
			},
			onEnd(e) {
				ancestryDrag.arrow = null;
				const hit = e.type === 'pointerup' ? trackedCellAt(e) : null;
				if (hit && hit.cell.TrackID !== source.cell.TrackID) {
					annotationState.setAncestor([hit.cell], source.cell.TrackID);
				}
			}
		});
	}

	// The tile's cells take the presses, so nothing covers them
	const listen: Attachment<SVGGElement> = (root) => {
		const stop = on(root.ownerSVGElement!, 'pointerdown', (e) =>
			press(root, e as PointerEvent)
		);
		return () => {
			stop();
			// Switching tools mid-drag removes this before the drag can end
			ancestryDrag.arrow = null;
		};
	};
</script>

<g {@attach listen} />
