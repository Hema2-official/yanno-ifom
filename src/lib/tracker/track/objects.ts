import { contourBox } from '../geometry/contours';
import type { TrackType } from '../output/records';
import { decodeCounts } from '../rle/coco';
import { area, centerMass, type MultiRle } from '../rle/rle';

/**
 * One segmented object as the tracker works with it: the facts the library derives from its mask when
 * it loads the annotation (IterAnnotRecords: CenterMass, BoundingBox), its local track once the kernel
 * has computed it, and its links.
 */
export interface TrackedObject {
	readonly frame: number;
	readonly objectId: string;
	readonly h: number;
	readonly w: number;
	/** the mask's runs, and its counts string as it came (the output keeps it) */
	readonly mask: Uint32Array;
	readonly counts: string;
	readonly area: number;
	readonly centroid: readonly [number, number] | null;
	/** BoundingBox of the mask: [minRow, minCol, maxRow, maxCol] */
	readonly segBbox: Int32Array;
	readonly className: string | null;
	readonly ancestorId: number | null;
	localTrack: MultiRle | null;
	/** the pixel counts of the local track's channels */
	localAreas: Int32Array | null;
	/** OuterBoundingBox of the local track */
	trackBbox: Int32Array | null;
	prevId: string | null;
	nextId: string | null;
	trackId: number | null;
}

export function trackedObject(record: TrackType): TrackedObject {
	const [h, w] = record.SegmentationRLE.size;
	const mask = decodeCounts(record.SegmentationRLE.counts);
	return {
		frame: record.Frame,
		objectId: record.ObjectID,
		h,
		w,
		mask,
		counts: record.SegmentationRLE.counts,
		area: area(mask),
		centroid: centerMass(mask, h),
		segBbox: contourBox(mask, h, w),
		className: record.Class,
		ancestorId: record.AncestorID,
		localTrack: null,
		localAreas: null,
		trackBbox: null,
		prevId: null,
		nextId: null,
		trackId: null
	};
}
