/**
 * The marker channel of the tracking model's input: TrackingKernel draws a 4 x 4 square of ones around
 * the object's centroid with Python's slicing, on the unpadded frame.
 */

/** Python's a[start:stop] on an axis of `length`: the indices from..to, exclusive (empty when to <= from). */
export function pythonSlice(start: number, stop: number, length: number): [number, number] {
	const clamp = (i: number) => (i < 0 ? Math.max(i + length, 0) : Math.min(i, length));
	return [clamp(start), clamp(stop)];
}

/** The rows top..bottom and columns left..right (exclusive) of TrackingKernel's marker for a centroid [x, y]: MarkerChannel[y-2:y+2, x-2:x+2]. */
export function centroidMarker(
	centroid: readonly [number, number],
	height: number,
	width: number
): [number, number, number, number] {
	const [top, bottom] = pythonSlice(centroid[1] - 2, centroid[1] + 2, height);
	const [left, right] = pythonSlice(centroid[0] - 2, centroid[0] + 2, width);
	return [top, Math.max(bottom, top), left, Math.max(right, left)];
}
