/**
 * The temporal network's hints of one frame: its objects as one label image, later objects winning
 * overlaps (infer_seg.label_images), reduced to one byte per pixel, bit 0 the foreground and bit 1 the
 * boundary: the pixels of an object next to a pixel of another label (data.boundary_of; nothing lies
 * beyond the frame's edge). Frames are written row-major, as the GPU's rings hold them.
 */
import type { TrackType } from '../output/records';
import { decodeCounts } from '../rle/coco';
import { columnSegments } from '../rle/rle';

export const FOREGROUND = 1,
	BOUNDARY = 2;

export class HintBuilder {
	/** the label image, column-major */
	private readonly labels: Int32Array;

	constructor(
		readonly height: number,
		readonly width: number
	) {
		this.labels = new Int32Array(height * width);
	}

	/** Writes the hint plane of the frame's objects, in record order, into `plane` (height * width bytes). */
	build(records: readonly TrackType[], plane: Uint8Array): void {
		const { height: h, width: w, labels } = this;
		labels.fill(0);
		plane.fill(0);
		records.forEach((record, i) => {
			const { segments, count } = columnSegments(
				decodeCounts(record.SegmentationRLE.counts),
				h
			);
			for (let k = 0; k < count; k++) {
				const column = segments[3 * k] * h;
				labels.fill(i + 1, column + segments[3 * k + 1], column + segments[3 * k + 2] + 1);
			}
		});
		for (let x = 0, p = 0; x < w; x++) {
			for (let y = 0; y < h; y++, p++) {
				const label = labels[p];
				if (label === 0) continue;
				const boundary =
					(y > 0 && labels[p - 1] !== label) ||
					(y < h - 1 && labels[p + 1] !== label) ||
					(x > 0 && labels[p - h] !== label) ||
					(x < w - 1 && labels[p + h] !== label);
				plane[y * w + x] = boundary ? FOREGROUND | BOUNDARY : FOREGROUND;
			}
		}
	}
}
