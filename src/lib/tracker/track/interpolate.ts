import { pad4 } from '../output/records';
import { translate } from '../rle/rle';
import type { TrackedObject } from './objects';

/** An object InterpolateGap fills in between two linked objects of a track. */
export interface InterpolatedObject {
	readonly frame: number;
	readonly objectId: string;
	readonly h: number;
	readonly w: number;
	readonly runs: Uint32Array;
	readonly centroid: readonly [number, number];
	readonly trackId: number;
}

/**
 * InterpolateGap of the library: one object for every frame strictly between the two, the earlier mask
 * moved to the linearly interpolated centroid (truncated toward zero, as Python's int()).
 */
export function interpolateGap(
	last: TrackedObject,
	next: TrackedObject,
	trackId: number
): InterpolatedObject[] {
	const f0 = last.frame,
		f1 = next.frame,
		diff = f1 - f0;
	if (diff <= 1) return [];
	if (last.centroid === null || next.centroid === null)
		throw new Error(`cannot interpolate ${last.objectId}: an empty mask has no centroid`);
	const [lx, ly] = last.centroid;
	const [nx, ny] = next.centroid;
	const objects: InterpolatedObject[] = [];
	for (let frame = f0 + 1; frame < f1; frame++) {
		const x = Math.trunc(((frame - f0) * nx + (f1 - frame) * lx) / diff);
		const y = Math.trunc(((frame - f0) * ny + (f1 - frame) * ly) / diff);
		objects.push({
			frame,
			objectId: pad4(frame + 1) + pad4(trackId) + 'ITP',
			h: last.h,
			w: last.w,
			runs: translate(last.mask, last.h, last.w, x - lx, y - ly),
			centroid: [x, y],
			trackId
		});
	}
	return objects;
}
