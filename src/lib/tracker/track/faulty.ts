import { boxOverlap } from '../geometry/boxes';
import { intersectionArea } from '../rle/rle';
import type { TrackedObject } from './objects';

export interface FaultyObjectParams {
	readonly minObjectPixelNumber: number;
	readonly maxOverlapRatio: number;
}

/** AnnotationOverlap of the library: the intersection over the smaller of the two areas, 0 if either is 0. */
export function overlapRatio(
	maskA: Uint32Array,
	areaA: number,
	maskB: Uint32Array,
	areaB: number
): number {
	const intersection = intersectionArea(maskA, maskB);
	if (intersection === 0) return 0;
	const smaller = Math.min(areaA, areaB);
	if (smaller === 0) return 0;
	return intersection / smaller;
}

export function annotationOverlap(a: TrackedObject, b: TrackedObject): number {
	return overlapRatio(a.mask, a.area, b.mask, b.area);
}

/**
 * FaultyObjectIDs of the library for the objects of one frame: too small, no centroid or a centroid on
 * the border, or covered by an object at least as large by more than maxOverlapRatio (pairs whose
 * contour boxes do not overlap are not compared).
 */
export function faultyObjectIds(
	objects: readonly TrackedObject[],
	height: number,
	width: number,
	params: FaultyObjectParams
): Set<string> {
	const faulty = new Set<string>();
	for (const object of objects) {
		let betterCovered = false;
		for (const other of objects) {
			if (
				object.objectId !== other.objectId &&
				boxOverlap(object.segBbox, other.segBbox) > 0
			) {
				if (
					object.area <= other.area &&
					annotationOverlap(object, other) > params.maxOverlapRatio
				)
					betterCovered = true;
			}
		}
		const c = object.centroid;
		if (
			object.area < params.minObjectPixelNumber ||
			c === null ||
			c[0] <= 0 ||
			c[1] <= 0 ||
			c[0] >= width - 1 ||
			c[1] >= height - 1 ||
			betterCovered
		) {
			faulty.add(object.objectId);
		}
	}
	return faulty;
}
