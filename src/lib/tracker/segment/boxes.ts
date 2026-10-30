/**
 * Boxes (x1, y1, x2, y2 in float32, four entries per box) as detectron2 and torchvision handle them on
 * the CPU, in PyTorch's operation order: Box2BoxTransform.apply_deltas, Boxes.clip and nonempty, and
 * torchvision's nms and batched_nms, with PyTorch's sort for their order of ties.
 */
import { torchExp } from '../math/float32';
import { torchSortDescending } from '../math/stdsort';

const f = Math.fround;

/** detectron2's _DEFAULT_SCALE_CLAMP, log(1000 / 16), as the float32 that torch.clamp compares with. */
const SCALE_CLAMP = f(Math.log(1000 / 16));

export type BoxWeights = readonly [number, number, number, number];

/**
 * Box2BoxTransform(weights).apply_deltas of the deltas at deltas[4d..] to the box at boxes[4b..], written
 * to out[4o..]. `exp` stands in for torch.exp (the tests vary it by one ULP).
 */
export function applyDeltas(
	boxes: ArrayLike<number>,
	b: number,
	deltas: ArrayLike<number>,
	d: number,
	weights: BoxWeights,
	out: Float32Array,
	o: number,
	exp: (x: number) => number = torchExp
): void {
	const x1 = boxes[4 * b],
		y1 = boxes[4 * b + 1],
		x2 = boxes[4 * b + 2],
		y2 = boxes[4 * b + 3];
	const width = f(x2 - x1),
		height = f(y2 - y1);
	const ctrX = f(x1 + f(0.5 * width)),
		ctrY = f(y1 + f(0.5 * height));
	const dx = f(deltas[4 * d] / weights[0]),
		dy = f(deltas[4 * d + 1] / weights[1]);
	const dw = Math.min(f(deltas[4 * d + 2] / weights[2]), SCALE_CLAMP),
		dh = Math.min(f(deltas[4 * d + 3] / weights[3]), SCALE_CLAMP);
	const predCtrX = f(f(dx * width) + ctrX),
		predCtrY = f(f(dy * height) + ctrY);
	const predW = f(exp(dw) * width),
		predH = f(exp(dh) * height);
	out[4 * o] = f(predCtrX - f(0.5 * predW));
	out[4 * o + 1] = f(predCtrY - f(0.5 * predH));
	out[4 * o + 2] = f(predCtrX + f(0.5 * predW));
	out[4 * o + 3] = f(predCtrY + f(0.5 * predH));
}

function clamp(v: number, limit: number): number {
	return v < 0 ? 0 : v > limit ? limit : v;
}

/** Boxes.clip((height, width)) of the first n boxes, in place. */
export function clipBoxes(boxes: Float32Array, n: number, height: number, width: number): void {
	for (let i = 0; i < 4 * n; i += 4) {
		boxes[i] = clamp(boxes[i], width);
		boxes[i + 1] = clamp(boxes[i + 1], height);
		boxes[i + 2] = clamp(boxes[i + 2], width);
		boxes[i + 3] = clamp(boxes[i + 3], height);
	}
}

/** Boxes.nonempty(threshold): width and height both above the threshold. */
export function nonempty(boxes: ArrayLike<number>, b: number, threshold = 0): boolean {
	return (
		f(boxes[4 * b + 2] - boxes[4 * b]) > threshold &&
		f(boxes[4 * b + 3] - boxes[4 * b + 1]) > threshold
	);
}

let areas = new Float32Array(0);
let suppressed = new Uint8Array(0);
let order = new Int32Array(0);
let rank = new Int32Array(0);
let seen = new Int32Array(0);
let cellRanges = new Int32Array(0);
let cellStart = new Int32Array(0);
let cellBoxes = new Int32Array(0);

/** Below this many boxes, nms compares every later box; from it on, only the boxes in the same grid cells. */
const GRID_MIN_BOXES = 256;
const GRID_MAX_SIDE = 128;

/** Whether box i suppresses box j: their IoU as torchvision computes it, in float32, above the threshold. */
function suppresses(boxes: Float32Array, i: number, j: number, iouThreshold: number): boolean {
	const ix1 = boxes[4 * i],
		iy1 = boxes[4 * i + 1],
		ix2 = boxes[4 * i + 2],
		iy2 = boxes[4 * i + 3];
	const jx1 = boxes[4 * j],
		jy1 = boxes[4 * j + 1],
		jx2 = boxes[4 * j + 2],
		jy2 = boxes[4 * j + 3];
	// std::max(a, b) is a < b ? b : a, and std::min(a, b) is b < a ? b : a
	const xx1 = ix1 < jx1 ? jx1 : ix1,
		yy1 = iy1 < jy1 ? jy1 : iy1;
	const xx2 = jx2 < ix2 ? jx2 : ix2,
		yy2 = jy2 < iy2 ? jy2 : iy2;
	const dx = f(xx2 - xx1),
		dy = f(yy2 - yy1);
	const inter = f((0 < dx ? dx : 0) * (0 < dy ? dy : 0));
	return f(inter / f(f(areas[i] + areas[j]) - inter)) > iouThreshold;
}

/**
 * Registers every box in the cells of a uniform grid that its rectangle touches (cellRanges holds each
 * box's cell columns and rows, cellStart and cellBoxes the boxes of each cell). Returns the grid's number
 * of columns, or 0 when the boxes do not fit a grid (coordinates that are not finite).
 */
function buildGrid(boxes: Float32Array, n: number): number {
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity,
		sides = 0;
	for (let i = 0; i < n; i++) {
		minX = Math.min(minX, boxes[4 * i]);
		minY = Math.min(minY, boxes[4 * i + 1]);
		maxX = Math.max(maxX, boxes[4 * i + 2]);
		maxY = Math.max(maxY, boxes[4 * i + 3]);
		sides += boxes[4 * i + 2] - boxes[4 * i] + boxes[4 * i + 3] - boxes[4 * i + 1];
	}
	if (!Number.isFinite(minX + minY + maxX + maxY + sides)) return 0;
	// cells about the size of the mean box
	const cell = Math.max(sides / (2 * n), 1e-6);
	const columns = Math.min(Math.ceil((maxX - minX) / cell) + 1, GRID_MAX_SIDE);
	const rows = Math.min(Math.ceil((maxY - minY) / cell) + 1, GRID_MAX_SIDE);
	const scaleX = columns / (maxX - minX + cell),
		scaleY = rows / (maxY - minY + cell);
	if (cellRanges.length < 4 * n) cellRanges = new Int32Array(4 * n);
	if (cellStart.length < columns * rows + 1) cellStart = new Int32Array(columns * rows + 1);
	cellStart.fill(0, 0, columns * rows + 1);
	let entries = 0;
	for (let i = 0; i < n; i++) {
		const cx1 = Math.min(Math.floor((boxes[4 * i] - minX) * scaleX), columns - 1);
		const cy1 = Math.min(Math.floor((boxes[4 * i + 1] - minY) * scaleY), rows - 1);
		const cx2 = Math.min(Math.floor((boxes[4 * i + 2] - minX) * scaleX), columns - 1);
		const cy2 = Math.min(Math.floor((boxes[4 * i + 3] - minY) * scaleY), rows - 1);
		cellRanges[4 * i] = cx1;
		cellRanges[4 * i + 1] = cy1;
		cellRanges[4 * i + 2] = cx2;
		cellRanges[4 * i + 3] = cy2;
		for (let cy = cy1; cy <= cy2; cy++)
			for (let cx = cx1; cx <= cx2; cx++) cellStart[cy * columns + cx + 1]++;
		entries += Math.max(cx2 - cx1 + 1, 0) * Math.max(cy2 - cy1 + 1, 0);
	}
	for (let c = 0; c < columns * rows; c++) cellStart[c + 1] += cellStart[c];
	if (cellBoxes.length < entries) cellBoxes = new Int32Array(entries);
	// cellStart[c + 1] is the end of cell c; filling each cell from its end leaves it at the cell's start
	for (let i = n - 1; i >= 0; i--) {
		for (let cy = cellRanges[4 * i + 1]; cy <= cellRanges[4 * i + 3]; cy++) {
			for (let cx = cellRanges[4 * i]; cx <= cellRanges[4 * i + 2]; cx++)
				cellBoxes[--cellStart[cy * columns + cx + 1]] = i;
		}
	}
	cellStart.copyWithin(0, 1, columns * rows + 1);
	cellStart[columns * rows] = entries;
	return columns;
}

/**
 * torchvision's CPU nms of n boxes (boxes[4i..], scores[i]): the boxes in the order of torch.sort of
 * their scores, each kept unless an earlier kept box overlaps it with an IoU above the threshold
 * (computed in float32, compared with the threshold as a double). Writes the kept indices to keep, in
 * that order, and returns their number.
 *
 * With many boxes, a kept box is compared only with the later boxes in its grid cells. That gives the
 * same result as comparing it with all of them: boxes that share no cell do not intersect, so their IoU
 * is 0 (or NaN, for two empty boxes), which never exceeds a threshold of 0 or more.
 */
export function nms(
	boxes: Float32Array,
	scores: Float32Array,
	n: number,
	iouThreshold: number,
	keep: Int32Array
): number {
	if (areas.length < n) {
		areas = new Float32Array(n);
		suppressed = new Uint8Array(n);
		order = new Int32Array(n);
		rank = new Int32Array(n);
		seen = new Int32Array(n);
	}
	for (let i = 0; i < n; i++)
		areas[i] = f(f(boxes[4 * i + 2] - boxes[4 * i]) * f(boxes[4 * i + 3] - boxes[4 * i + 1]));
	suppressed.fill(0, 0, n);
	torchSortDescending(scores, n, order);
	const columns = n >= GRID_MIN_BOXES && iouThreshold >= 0 ? buildGrid(boxes, n) : 0;
	let kept = 0;
	if (columns === 0) {
		for (let a = 0; a < n; a++) {
			const i = order[a];
			if (suppressed[i]) continue;
			keep[kept++] = i;
			for (let b = a + 1; b < n; b++) {
				const j = order[b];
				if (!suppressed[j] && suppresses(boxes, i, j, iouThreshold)) suppressed[j] = 1;
			}
		}
		return kept;
	}
	for (let a = 0; a < n; a++) rank[order[a]] = a;
	seen.fill(-1, 0, n);
	for (let a = 0; a < n; a++) {
		const i = order[a];
		if (suppressed[i]) continue;
		keep[kept++] = i;
		for (let cy = cellRanges[4 * i + 1]; cy <= cellRanges[4 * i + 3]; cy++) {
			for (let cx = cellRanges[4 * i]; cx <= cellRanges[4 * i + 2]; cx++) {
				const c = cy * columns + cx;
				for (let e = cellStart[c]; e < cellStart[c + 1]; e++) {
					const j = cellBoxes[e];
					if (rank[j] <= a || suppressed[j] || seen[j] === a) continue;
					seen[j] = a;
					if (suppresses(boxes, i, j, iouThreshold)) suppressed[j] = 1;
				}
			}
		}
	}
	return kept;
}

/**
 * torchvision's batched_nms of n boxes with category idxs[i]: an independent NMS per category, the kept
 * boxes sorted by score. Above 4,000 coordinates it runs one nms per category (_batched_nms_vanilla);
 * otherwise one nms over boxes shifted apart by category (_batched_nms_coordinate_trick), in float32.
 * Writes the kept indices to keep and returns their number.
 */
export function batchedNms(
	boxes: Float32Array,
	scores: Float32Array,
	idxs: Int32Array,
	n: number,
	iouThreshold: number,
	keep: Int32Array
): number {
	if (n === 0) return 0;
	if (4 * n > 4000) return batchedNmsVanilla(boxes, scores, idxs, n, iouThreshold, keep);
	let max = -Infinity;
	for (let i = 0; i < 4 * n; i++) {
		const v = boxes[i];
		if (v > max || v !== v) max = v;
	}
	const shift = f(max + 1);
	const shifted = new Float32Array(4 * n);
	for (let i = 0; i < n; i++) {
		const offset = f(idxs[i] * shift);
		for (let c = 0; c < 4; c++) shifted[4 * i + c] = f(boxes[4 * i + c] + offset);
	}
	return nms(shifted, scores, n, iouThreshold, keep);
}

function batchedNmsVanilla(
	boxes: Float32Array,
	scores: Float32Array,
	idxs: Int32Array,
	n: number,
	iouThreshold: number,
	keep: Int32Array
): number {
	const kept = new Uint8Array(n);
	const categories = Array.from(new Set(idxs.subarray(0, n))).sort((a, b) => a - b);
	const members = new Int32Array(n),
		subBoxes = new Float32Array(4 * n),
		subScores = new Float32Array(n),
		subKeep = new Int32Array(n);
	for (const category of categories) {
		let m = 0;
		for (let i = 0; i < n; i++) {
			if (idxs[i] !== category) continue;
			members[m] = i;
			subBoxes.set(boxes.subarray(4 * i, 4 * i + 4), 4 * m);
			subScores[m] = scores[i];
			m++;
		}
		const count = nms(subBoxes, subScores, m, iouThreshold, subKeep);
		for (let k = 0; k < count; k++) kept[members[subKeep[k]]] = 1;
	}
	let count = 0;
	const keptScores = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		if (!kept[i]) continue;
		members[count] = i;
		keptScores[count++] = scores[i];
	}
	const sorted = torchSortDescending(keptScores, count);
	for (let k = 0; k < count; k++) keep[k] = members[sorted[k]];
	return count;
}
