/** The temporal pass's records of one frame: its objects with MasksToAnnot's IDs, numbered from 1 within the frame. */
import { pad4, trackType, type TrackType } from '../output/records';
import { encodeCounts } from '../rle/coco';

export function temporalRecords(
	frame: number,
	objects: readonly Uint32Array[],
	height: number,
	width: number
): TrackType[] {
	return objects.map((runs, i) =>
		trackType(
			frame,
			pad4(frame) + pad4(i + 1),
			height,
			width,
			encodeCounts(runs),
			null,
			false,
			null,
			null
		)
	);
}
