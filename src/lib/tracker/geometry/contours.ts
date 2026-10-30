/**
 * The boxes that the library takes from cv2.findContours(mask, RETR_EXTERNAL, CHAIN_APPROX_SIMPLE):
 * BoundingBox uses contours[0] only, and OuterBoundingBox the contours[0] of every channel.
 *
 * Each external contour is the outer border of an 8-connected component of the ones, and starts at the
 * component's first pixel in raster order (row by row, left to right). OpenCV lists the external
 * contours in descending raster order of these first pixels, so contours[0] belongs to the component
 * whose first pixel comes last. A component is not external when it lies in a hole of another one:
 * then the pixel above its first pixel belongs to a background region (4-connected, like OpenCV's
 * background) that does not reach the image border.
 */
import { channel, channelCount, columnSegments, type MultiRle } from '../rle/rle';

// scratch arrays, grown on demand and reused by every call
let parent = new Int32Array(1024);
let firstRow = new Int32Array(1024);
let firstColumn = new Int32Array(1024);
let boxes = new Int32Array(4 * 1024);
let background = new Int32Array(3 * 1024);
let backgroundParent = new Int32Array(1024);
let backgroundCount = 0;

function find(p: Int32Array, i: number): number {
	while (p[i] !== i) {
		p[i] = p[p[i]];
		i = p[i];
	}
	return i;
}

function union(p: Int32Array, a: number, b: number): void {
	const ra = find(p, a),
		rb = find(p, b);
	if (ra !== rb) {
		if (ra < rb) p[rb] = ra;
		else p[ra] = rb;
	}
}

/**
 * Union of the segments of neighbouring columns that touch: rows overlapping (gap = 0, 4-connectivity)
 * or within one row of each other (gap = 1, 8-connectivity). seg holds (x, firstRow, lastRow) triples in
 * column-major order.
 */
function connectColumns(seg: Int32Array, count: number, p: Int32Array, gap: number): void {
	let j = 0;
	for (let i = 0; i < count; i++) {
		const x = seg[3 * i],
			y0 = seg[3 * i + 1],
			y1 = seg[3 * i + 2];
		// segments of column x + 1 that end above this one cannot touch the later segments of column x either
		while (
			j < count &&
			(seg[3 * j] < x + 1 || (seg[3 * j] === x + 1 && seg[3 * j + 2] + gap < y0))
		)
			j++;
		for (let k = j; k < count && seg[3 * k] === x + 1 && seg[3 * k + 1] <= y1 + gap; k++)
			union(p, i, k);
	}
}

function addBackground(column: number, y0: number, y1: number): void {
	if (3 * backgroundCount + 3 > background.length) {
		const grown = new Int32Array(background.length * 2);
		grown.set(background);
		background = grown;
	}
	background[3 * backgroundCount] = column;
	background[3 * backgroundCount + 1] = y0;
	background[3 * backgroundCount + 2] = y1;
	backgroundCount++;
}

/**
 * The background regions of the mask: the gaps between each column's segments (whole columns where it
 * has none), joined with 4-connectivity, and with node backgroundCount standing for the zero border
 * OpenCV puts around the image.
 */
function prepareBackground(seg: Int32Array, count: number, h: number, w: number): void {
	backgroundCount = 0;
	let k = 0;
	for (let column = 0; column < w; column++) {
		let next = 0;
		while (k < count && seg[3 * k] === column) {
			if (seg[3 * k + 1] > next) addBackground(column, next, seg[3 * k + 1] - 1);
			next = seg[3 * k + 2] + 1;
			k++;
		}
		if (next < h) addBackground(column, next, h - 1);
	}
	const n = backgroundCount;
	if (n + 1 > backgroundParent.length)
		backgroundParent = new Int32Array(Math.max(n + 1, backgroundParent.length * 2));
	for (let i = 0; i <= n; i++) backgroundParent[i] = i;
	for (let i = 0; i < n; i++) {
		const column = background[3 * i];
		if (
			column === 0 ||
			column === w - 1 ||
			background[3 * i + 1] === 0 ||
			background[3 * i + 2] === h - 1
		) {
			union(backgroundParent, i, n);
		}
	}
	connectColumns(background, n, backgroundParent, 0);
}

/** Whether the background pixel (row, x) belongs to the region that reaches the image border. */
function reachesBorder(x: number, row: number): boolean {
	const border = find(backgroundParent, backgroundCount);
	for (let i = 0; i < backgroundCount; i++) {
		if (
			background[3 * i] === x &&
			background[3 * i + 1] <= row &&
			row <= background[3 * i + 2]
		) {
			return find(backgroundParent, i) === border;
		}
	}
	return false;
}

function grow(count: number): void {
	if (count <= parent.length) return;
	const size = Math.max(count, parent.length * 2);
	parent = new Int32Array(size);
	firstRow = new Int32Array(size);
	firstColumn = new Int32Array(size);
	boxes = new Int32Array(4 * size);
}

/**
 * BoundingBox of the library for one mask: the box of contours[0] as [minRow, minCol, maxRow + 1,
 * maxCol + 1], or [h, w, 0, 0] for an empty mask. Written into `out`, which is returned.
 */
export function contourBox(
	runs: Uint32Array,
	h: number,
	w: number,
	out: Int32Array = new Int32Array(4)
): Int32Array {
	const { segments: seg, count } = columnSegments(runs, h);
	if (count === 0) {
		out[0] = h;
		out[1] = w;
		out[2] = 0;
		out[3] = 0;
		return out;
	}
	grow(count);
	for (let i = 0; i < count; i++) parent[i] = i;
	connectColumns(seg, count, parent, 1);

	// per component, at its root: the first pixel in raster order and the box. Segments come in
	// column-major order, so of two segments with the same first row the earlier one has the smaller column.
	let components = 0;
	for (let i = 0; i < count; i++) {
		if (parent[i] === i) {
			components++;
			firstRow[i] = h;
		}
	}
	for (let i = 0; i < count; i++) {
		const r = find(parent, i);
		const x = seg[3 * i],
			y0 = seg[3 * i + 1],
			y1 = seg[3 * i + 2];
		if (firstRow[r] === h) {
			boxes[4 * r] = y0;
			boxes[4 * r + 1] = x;
			boxes[4 * r + 2] = y1;
			boxes[4 * r + 3] = x;
		}
		if (y0 < firstRow[r]) {
			firstRow[r] = y0;
			firstColumn[r] = x;
		}
		if (y0 < boxes[4 * r]) boxes[4 * r] = y0;
		if (y1 > boxes[4 * r + 2]) boxes[4 * r + 2] = y1;
		boxes[4 * r + 3] = x; // the columns only grow
	}

	let best = -1;
	if (components === 1) {
		best = 0;
	} else {
		// components by descending first pixel; the first external one is contours[0]
		const roots: number[] = [];
		for (let i = 0; i < count; i++) if (parent[i] === i) roots.push(i);
		roots.sort((a, b) => firstRow[b] - firstRow[a] || firstColumn[b] - firstColumn[a]);
		let prepared = false;
		for (const r of roots) {
			if (firstRow[r] === 0) {
				best = r;
				break;
			}
			if (!prepared) {
				prepareBackground(seg, count, h, w);
				prepared = true;
			}
			if (reachesBorder(firstColumn[r], firstRow[r] - 1)) {
				best = r;
				break;
			}
		}
	}
	out[0] = boxes[4 * best];
	out[1] = boxes[4 * best + 1];
	out[2] = boxes[4 * best + 2] + 1;
	out[3] = boxes[4 * best + 3] + 1;
	return out;
}

const channelBox = new Int32Array(4);

/**
 * OuterBoundingBox of the library: the union of the channels' contour boxes, starting from
 * [h, w, 0, 0], as [minRow, minCol, maxRow, maxCol].
 */
export function outerBoundingBox(m: MultiRle, out: Int32Array = new Int32Array(4)): Int32Array {
	out[0] = m.h;
	out[1] = m.w;
	out[2] = 0;
	out[3] = 0;
	for (let k = 0; k < channelCount(m); k++) {
		const runs = channel(m, k);
		if (runs.length < 2) continue; // an empty channel has no contours
		contourBox(runs, m.h, m.w, channelBox);
		if (channelBox[0] < out[0]) out[0] = channelBox[0];
		if (channelBox[1] < out[1]) out[1] = channelBox[1];
		if (channelBox[2] > out[2]) out[2] = channelBox[2];
		if (channelBox[3] > out[3]) out[3] = channelBox[3];
	}
	return out;
}
