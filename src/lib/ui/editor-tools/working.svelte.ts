import { SvelteMap } from 'svelte/reactivity';
import { annotationState } from '$lib/states/AnnotationState.svelte';
import { optionsState } from '$lib/states/options.svelte';
import type { TrackType } from '$lib/types/annotation.type';
import type { Polygon } from '$lib/types/geometry.type';
import { resampleCellBodies } from '$lib/utils/geometry';
import { rleToPolygons } from '$lib/utils/rle';

/** A cell with the polygons a tool shows for it. */
export type OutlineEntry = { cell: TrackType; bodies: Polygon[] };

/** What a tool shows between gestures: the memoized polygons, which are never mutated. */
export function outlinesOf(cells: TrackType[]): OutlineEntry[] {
	return cells.map((cell) => ({ cell, bodies: rleToPolygons(cell.SegmentationRLE) }));
}

/** The outlines of the gesture in progress by ObjectID, which the tiles draw the cells with. */
export const liveOutlines = new SvelteMap<string, Polygon[]>();

/**
 * A cell's outline copied for one gesture. Tools move the points of `bodies`
 * in place while dragging (it is reactive) and commit once at the end.
 */
export class WorkingCell implements OutlineEntry {
	readonly cell: TrackType;
	bodies: Polygon[] = $state([]);

	constructor(cell: TrackType, { resample = optionsState.autoResample.current } = {}) {
		this.cell = cell;
		const polygons = structuredClone(rleToPolygons(cell.SegmentationRLE));
		this.bodies = resample
			? resampleCellBodies(polygons, optionsState.resampleSegmentLength.current)
			: polygons;
		liveOutlines.set(cell.ObjectID, this.bodies);
	}
}

/** Ends a gesture without a change, the cells back in their saved outlines. */
export function dropWorking(working: WorkingCell[]) {
	for (const { cell } of working) liveOutlines.delete(cell.ObjectID);
}

/** Commits the working outlines of one gesture as one change. */
export function commitWorking(working: WorkingCell[]): boolean {
	dropWorking(working);
	const message =
		working.length === 1
			? `Edit cell ${working[0].cell.ObjectID}`
			: `Edit ${working.length} cells`;
	return annotationState.setOutlines(
		working.map(({ cell, bodies }) => ({ cell, polygons: bodies })),
		message
	);
}
