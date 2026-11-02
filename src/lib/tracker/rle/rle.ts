/**
 * Run-length encodings of binary masks in pycocotools' layout: the pixels in column-major order
 * (index = x * h + y), as alternating runs of zeros and ones that start with zeros (that first run may
 * be empty). The functions here work on the runs, in time proportional to their number, never on the
 * pixels.
 */

/** The runs of a mask of h rows and w columns. */
export interface Rle {
	readonly h: number;
	readonly w: number;
	readonly runs: Uint32Array;
}

/** Masks of one size packed into one array, such as the 15 channels of a local track. */
export interface MultiRle {
	readonly h: number;
	readonly w: number;
	/** channel k is runs.subarray(offsets[k], offsets[k + 1]) */
	readonly offsets: Uint32Array;
	readonly runs: Uint32Array;
}

export function channelCount(m: MultiRle): number {
	return m.offsets.length - 1;
}

export function channel(m: MultiRle, k: number): Uint32Array {
	return m.runs.subarray(m.offsets[k], m.offsets[k + 1]);
}

/** The channels' runs packed into one MultiRle (one allocation). */
export function pack(h: number, w: number, channels: readonly Uint32Array[]): MultiRle {
	const offsets = new Uint32Array(channels.length + 1);
	for (let k = 0; k < channels.length; k++) offsets[k + 1] = offsets[k] + channels[k].length;
	const runs = new Uint32Array(offsets[channels.length]);
	for (let k = 0; k < channels.length; k++) runs.set(channels[k], offsets[k]);
	return { h, w, offsets, runs };
}

/** The number of ones (pycocotools' area). */
export function area(runs: Uint32Array): number {
	let a = 0;
	for (let k = 1; k < runs.length; k += 2) a += runs[k];
	return a;
}

/**
 * pycocotools' toBbox: [x, y, width, height], all zeros for an empty mask. Like rleToBbox, a ones run
 * that continues into the next column makes the box span the whole height.
 */
export function toBbox(runs: Uint32Array, h: number, w: number): [number, number, number, number] {
	const m = runs.length - (runs.length % 2);
	if (m === 0) return [0, 0, 0, 0];
	let xs = w,
		ys = h,
		xe = 0,
		ye = 0,
		cc = 0,
		xp = 0;
	for (let j = 0; j < m; j++) {
		cc += runs[j];
		const t = cc - (j % 2);
		const y = t % h;
		const x = (t - y) / h;
		if (j % 2 === 0) xp = x;
		else if (xp < x) {
			ys = 0;
			ye = h - 1;
		}
		if (x < xs) xs = x;
		if (x > xe) xe = x;
		if (y < ys) ys = y;
		if (y > ye) ye = y;
	}
	return [xs, ys, xe - xs + 1, ye - ys + 1];
}

/** The pixel count of the intersection of two masks of one size (pycocotools' area of their merge with intersect). */
export function intersectionArea(a: Uint32Array, b: Uint32Array): number {
	// the ones runs [sa, sa + a[i]) and [sb, sb + b[j]), walked in step
	let i = 1,
		j = 1;
	let sa = a[0],
		sb = b[0];
	let inter = 0;
	while (i < a.length && j < b.length) {
		const ea = sa + a[i],
			eb = sb + b[j];
		const lo = sa > sb ? sa : sb;
		const hi = ea < eb ? ea : eb;
		if (hi > lo) inter += hi - lo;
		if (ea <= eb) {
			sa = ea + (i + 1 < a.length ? a[i + 1] : 0);
			i += 2;
		} else {
			sb = eb + (j + 1 < b.length ? b[j + 1] : 0);
			j += 2;
		}
	}
	return inter;
}

/**
 * The moments [m00, m10, m01] of the mask as cv2.moments gives them for a 0/1 image: the pixel count,
 * the sum of the column indices and the sum of the row indices. Exact: the sums stay far below 2^53.
 */
export function moments(runs: Uint32Array, h: number): [number, number, number] {
	let m00 = 0,
		m10 = 0,
		m01 = 0,
		pos = 0;
	for (let k = 0; k < runs.length; k++) {
		const length = runs[k];
		if (k & 1) {
			// a ones run may continue over several columns
			let s = pos;
			const e = pos + length;
			while (s < e) {
				const x = Math.floor(s / h);
				const columnStart = x * h;
				const segmentEnd = e < columnStart + h ? e : columnStart + h;
				const c = segmentEnd - s;
				const y0 = s - columnStart;
				m00 += c;
				m10 += c * x;
				m01 += c * y0 + (c * (c - 1)) / 2;
				s = segmentEnd;
			}
		}
		pos += length;
	}
	return [m00, m10, m01];
}

/** CenterMass of the library: [cX, cY], the moments' quotients truncated, or null for an empty mask. */
export function centerMass(runs: Uint32Array, h: number): [number, number] | null {
	const [m00, m10, m01] = moments(runs, h);
	if (m00 === 0) return null;
	return [Math.trunc(m10 / m00), Math.trunc(m01 / m00)];
}

let segmentScratch = new Int32Array(3 * 1024);

/**
 * The ones of the mask as column segments (x, firstRow, lastRow), in column-major order, written into
 * a shared scratch array that the next call overwrites. Returns the array and the segment count.
 */
export function columnSegments(
	runs: Uint32Array,
	h: number
): { segments: Int32Array; count: number } {
	let count = 0,
		pos = 0;
	for (let k = 0; k < runs.length; k++) {
		const length = runs[k];
		if (k & 1) {
			let s = pos;
			const e = pos + length;
			while (s < e) {
				const x = Math.floor(s / h);
				const columnStart = x * h;
				const segmentEnd = e < columnStart + h ? e : columnStart + h;
				if (3 * count + 3 > segmentScratch.length) {
					const grown = new Int32Array(segmentScratch.length * 2);
					grown.set(segmentScratch);
					segmentScratch = grown;
				}
				segmentScratch[3 * count] = x;
				segmentScratch[3 * count + 1] = s - columnStart;
				segmentScratch[3 * count + 2] = segmentEnd - 1 - columnStart;
				count++;
				s = segmentEnd;
			}
		}
		pos += length;
	}
	return { segments: segmentScratch, count };
}

let runScratch = new Uint32Array(1024);

function pushRun(count: number, value: number): void {
	if (count >= runScratch.length) {
		const grown = new Uint32Array(runScratch.length * 2);
		grown.set(runScratch);
		runScratch = grown;
	}
	runScratch[count] = value;
}

/**
 * The mask moved by dx columns and dy rows, with the pixels moved outside dropped and zeros moved in:
 * shift_2d_replace(mask, dx, dy, constant=0) of the library, encoded as pycocotools encodes it.
 */
export function translate(
	runs: Uint32Array,
	h: number,
	w: number,
	dx: number,
	dy: number
): Uint32Array {
	return pasteRuns(runs, h, h, w, dy, dx, h, w);
}

/**
 * A mask of `sourceHeight` rows pasted into an h x w mask with its first pixel at (top, left), the pixels
 * outside the first `rows` rows and `columns` columns dropped.
 */
export function pasteRuns(
	runs: Uint32Array,
	sourceHeight: number,
	h: number,
	w: number,
	top: number,
	left: number,
	rows: number,
	columns: number
): Uint32Array {
	const { segments, count: segmentCount } = columnSegments(runs, sourceHeight);
	let count = 0,
		end = 0;
	for (let k = 0; k < segmentCount; k++) {
		const x = segments[3 * k] + left;
		if (x < 0 || x >= columns) continue;
		const y0 = Math.max(0, segments[3 * k + 1] + top);
		const y1 = Math.min(rows - 1, segments[3 * k + 2] + top);
		if (y0 > y1) continue;
		const s = x * h + y0,
			e = x * h + y1 + 1;
		if (count > 0 && s === end) {
			// continues the previous run into this column
			runScratch[count - 1] += e - s;
		} else {
			pushRun(count++, s - end);
			pushRun(count++, e - s);
		}
		end = e;
	}
	// like pycocotools, no zero run after a mask that ends with a one
	if (count === 0 || end < h * w) pushRun(count++, h * w - end);
	return runScratch.slice(0, count);
}
