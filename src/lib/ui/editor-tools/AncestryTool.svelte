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
	import { editorState } from '$lib/states/EditorState.svelte';
	import { keybindings } from '$lib/states/KeybindingState.svelte';
	import type { TrackType } from '$lib/types/annotation.type';
	import type { ClientPoint } from '$lib/utils/display';
	import { startDrag } from '$lib/utils/drag';
	import { cellCenter } from '$lib/utils/tracks';
	import type { EditorToolProps } from './types';

	// It finds the cells by the pointer, in whichever frame
	let {}: EditorToolProps = $props();

	type Hit = { cell: TrackType; tile: SVGSVGElement };

	/** The cell an element draws, if it has a track ID: the tool sees no others. */
	function trackedCell(element: Element): Hit | null {
		const id = element.closest('[data-cell-id]')?.getAttribute('data-cell-id');
		const cell = id ? annotationState.getCell(id) : undefined;
		const tile = element.closest('svg');
		return cell && cell.TrackID !== null && tile ? { cell, tile } : null;
	}

	/** The topmost tracked cell there, in whichever tile. */
	function trackedCellAt({ clientX, clientY }: ClientPoint): Hit | null {
		for (const element of document.elementsFromPoint(clientX, clientY)) {
			const hit = trackedCell(element);
			if (hit) return hit;
		}
		return null;
	}

	function clientCenter({ cell, tile }: Hit): Point {
		const { x, y } = cellCenter(cell);
		return new DOMPoint(x, y).matrixTransform(tile.getScreenCTM() ?? undefined);
	}

	function press(root: SVGGElement, e: PointerEvent) {
		// Clicks that add to the selection are the display's
		const selecting =
			keybindings.isActive('selection.add', e) || keybindings.isActive('selection.range', e);
		const source = trackedCell(e.target as Element);
		if (e.button !== 0 || selecting || !source) return;

		e.preventDefault();
		e.stopPropagation();
		startDrag(root, e, {
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
				if (!hit) return;
				if (hit.cell.TrackID !== source.cell.TrackID) {
					annotationState.setAncestor([hit.cell], source.cell.TrackID);
				} else if (hit.cell === source.cell) {
					editorState.select(hit.cell);
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
