/**
 * Euclidean inheritance (EuclideanAncestors / BuildInheritanceTree of the experimental copy): a track
 * that starts after the first frame gets as its mother the nearest other track present on its first
 * frame, if their centroids are at most maxCentroidDistance apart. Frame by frame; it keeps the mother
 * of every track seen so far, nothing else.
 */
import { decodeCounts } from '../rle/coco';
import { centerMass } from '../rle/rle';
import type { TrackType } from '../output/records';

export class EuclideanAncestors {
	/** the mother of every track seen so far (null: none) */
	readonly mothers = new Map<number | null, number | null>();
	private firstFrame: number | null = null;

	constructor(private readonly maxCentroidDistance: number) {}

	/** Processes the records of the next frame, in their order, and returns the mothers map. */
	addFrame(frame: number, records: readonly TrackType[]): Map<number | null, number | null> {
		if (this.firstFrame === null) this.firstFrame = frame;
		// the first record of each track on this frame, with its centroid computed from the mask
		const present = new Map<number | null, readonly [number, number] | null>();
		for (const record of records) {
			if (!present.has(record.TrackID)) {
				const [h] = record.SegmentationRLE.size;
				present.set(
					record.TrackID,
					centerMass(decodeCounts(record.SegmentationRLE.counts), h)
				);
			}
		}
		for (const [child, childCentroid] of present) {
			if (this.mothers.has(child)) continue;
			let mother: number | null = null;
			let minDistance: number | null = null;
			if (frame !== this.firstFrame) {
				for (const [candidate, candidateCentroid] of present) {
					if (candidate === child) continue;
					if (childCentroid === null || candidateCentroid === null) {
						throw new Error(
							`track ${child} or ${candidate} has an empty mask on frame ${frame}, without centroid`
						);
					}
					const distance = Math.sqrt(
						(candidateCentroid[0] - childCentroid[0]) ** 2 +
							(candidateCentroid[1] - childCentroid[1]) ** 2
					);
					if (
						distance <= this.maxCentroidDistance &&
						(minDistance === null || distance < minDistance)
					) {
						minDistance = distance;
						mother = candidate;
					}
				}
			}
			this.mothers.set(child, mother);
		}
		return this.mothers;
	}
}

/**
 * BuildInheritanceTree on a whole annotation list: the records in the same order, every AncestorID set
 * to the mother of its track (null without one). The frames are taken in ascending order, the records
 * of a frame in list order (GroupByFrame).
 */
export function inheritRecords(
	records: readonly TrackType[],
	maxCentroidDistance: number
): TrackType[] {
	const byFrame = new Map<number, TrackType[]>();
	for (const record of records) {
		const group = byFrame.get(record.Frame);
		if (group) group.push(record);
		else byFrame.set(record.Frame, [record]);
	}
	const ancestors = new EuclideanAncestors(maxCentroidDistance);
	for (const frame of [...byFrame.keys()].sort((a, b) => a - b))
		ancestors.addFrame(frame, byFrame.get(frame)!);
	return records.map((r) => ({ ...r, AncestorID: ancestors.mothers.get(r.TrackID) ?? null }));
}
