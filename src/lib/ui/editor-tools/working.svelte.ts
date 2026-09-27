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

/**
 * A cell's outline copied for one gesture. Tools move the points of `bodies`
 * in place while dragging (it is reactive) and commit once at the end.
 */
export class WorkingCell implements OutlineEntry {
	readonly cell: TrackType;
	bodies: Polygon[] = $state([]);

	constructor(cell: TrackType) {
		this.cell = cell;
		const polygons = structuredClone(rleToPolygons(cell.SegmentationRLE));
		this.bodies = optionsState.autoResample.current
			? resampleCellBodies(polygons, optionsState.resampleSegmentLength.current)
			: polygons;
	}
}

/** Commits the working outlines of one gesture as one change. */
export function commitWorking(working: WorkingCell[]): boolean {
	const message =
		working.length === 1
			? `Edit cell ${working[0].cell.ObjectID}`
			: `Edit ${working.length} cells`;
	return annotationState.setOutlines(
		working.map(({ cell, bodies }) => ({ cell, polygons: bodies })),
		message
	);
}
