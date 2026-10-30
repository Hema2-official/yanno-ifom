/**
 * The segmentation's records of one frame, as PerformSegmentation and MasksToAnnot make them: the masks
 * of at least the minimum size, in detection order, numbered from 1 within the frame.
 */
import { pad4, trackType, type TrackType } from '../output/records';
import { encodeCounts } from '../rle/coco';
import type { PastedMask } from './paste';

export function maskRecords(
	frame: number,
	masks: readonly PastedMask[],
	minObjectSize: number | null,
	height: number,
	width: number
): TrackType[] {
	const records: TrackType[] = [];
	for (const mask of masks) {
		if (minObjectSize !== null && mask.area < minObjectSize) continue;
		records.push(
			trackType(
				frame,
				pad4(frame) + pad4(records.length + 1),
				height,
				width,
				encodeCounts(mask.runs),
				null,
				false,
				null,
				null
			)
		);
	}
	return records;
}
