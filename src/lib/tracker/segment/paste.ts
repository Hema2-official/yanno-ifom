/**
 * A detection's mask in the image, as detectron2 makes it on the CPU: the mask head's 28 x 28 logits
 * through torch.sigmoid (mask_rcnn_inference), pasted into the box by paste_masks_in_image (skip_empty:
 * only the box plus one pixel is computed, through F.grid_sample, bilinear, zero padding, align_corners
 * False) and thresholded at 0.5. The pasted crop goes straight into pycocotools' column-major runs; the
 * rest of the image is zero runs, computed rather than scanned.
 *
 * grid_sample's float32 steps are those of PyTorch's AVX2 kernel (GridSamplerKernel.cpp), where the
 * compiler fuses each multiply-add (the golden table paste matches only this way): the source coordinate
 * is fma(g + 1, size / 2, -0.5), and the four neighbours v with their weights w are summed as
 * fma(v_se, w_se, fma(v_sw, w_sw, fma(v_ne, w_ne, v_nw * w_nw))), the operands evaluated right to left.
 */
import { fmaFloat32, torchSigmoid } from '../math/float32';

const f = Math.fround;

/** A pasted crop: columns left..right, rows top..bottom (exclusive), values column-major (column * height + row). */
export interface PastedCrop {
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly values: Float32Array;
}

export interface PastedMask {
	/** column-major runs of the whole image, starting with zeros */
	readonly runs: Uint32Array;
	readonly area: number;
}

let probabilities = new Float32Array(0);
let crop = new Float32Array(0);
let columns = new Float64Array(0);
let rows = new Float64Array(0);

/**
 * grid_sample's source coordinate for a normalized grid value g on an axis of `size` cells, with its
 * floor and the distances to both neighbours: [floor, distance to the lower, distance to the upper].
 */
function sourceCoordinate(g: number, size: number, out: Float64Array, at: number): void {
	const x = fmaFloat32(f(g + 1), size / 2, -0.5);
	const floor = Math.floor(x);
	const lower = f(x - floor);
	out[at] = floor;
	out[at + 1] = lower;
	out[at + 2] = f(1 - lower);
}

/**
 * _do_paste_mask (skip_empty) of an m x m mask of probabilities (row-major) into the box at box[4b..], in
 * an image of height x width: the crop's bounds and its values before the threshold. The values are
 * reused by the next call.
 */
export function pasteProbabilities(
	probabilities: Float32Array,
	m: number,
	box: Float32Array,
	b: number,
	height: number,
	width: number
): PastedCrop {
	const x0 = box[4 * b],
		y0 = box[4 * b + 1],
		x1 = box[4 * b + 2],
		y1 = box[4 * b + 3];
	const left = Math.max(Math.floor(x0) - 1, 0),
		top = Math.max(Math.floor(y0) - 1, 0);
	const right = Math.min(Math.ceil(x1) + 1, width),
		bottom = Math.min(Math.ceil(y1) + 1, height);
	const cropWidth = Math.max(right - left, 0),
		cropHeight = Math.max(bottom - top, 0);

	// img_x = (arange(left, right) + 0.5 - x0) / (x1 - x0) * 2 - 1, and the same for rows, each op in float32
	if (columns.length < 3 * cropWidth) columns = new Float64Array(3 * cropWidth);
	if (rows.length < 3 * cropHeight) rows = new Float64Array(3 * cropHeight);
	if (crop.length < cropWidth * cropHeight) crop = new Float32Array(cropWidth * cropHeight);
	const boxWidth = f(x1 - x0),
		boxHeight = f(y1 - y0);
	for (let i = 0; i < cropWidth; i++)
		sourceCoordinate(f(f(f(f(f(left + i + 0.5) - x0) / boxWidth) * 2) - 1), m, columns, 3 * i);
	for (let j = 0; j < cropHeight; j++)
		sourceCoordinate(f(f(f(f(f(top + j + 0.5) - y0) / boxHeight) * 2) - 1), m, rows, 3 * j);

	for (let i = 0; i < cropWidth; i++) {
		const xw = columns[3 * i],
			w = columns[3 * i + 1],
			e = columns[3 * i + 2];
		const westIn = xw >= 0 && xw < m,
			eastIn = xw + 1 >= 0 && xw + 1 < m;
		for (let j = 0; j < cropHeight; j++) {
			const yn = rows[3 * j],
				n = rows[3 * j + 1],
				s = rows[3 * j + 2];
			const northIn = yn >= 0 && yn < m,
				southIn = yn + 1 >= 0 && yn + 1 < m;
			const nwValue = westIn && northIn ? probabilities[yn * m + xw] : 0;
			const neValue = eastIn && northIn ? probabilities[yn * m + xw + 1] : 0;
			const swValue = westIn && southIn ? probabilities[(yn + 1) * m + xw] : 0;
			const seValue = eastIn && southIn ? probabilities[(yn + 1) * m + xw + 1] : 0;
			const nw = f(s * e),
				ne = f(s * w),
				sw = f(n * e),
				se = f(n * w);
			crop[i * cropHeight + j] = fmaFloat32(
				seValue,
				se,
				fmaFloat32(swValue, sw, fmaFloat32(neValue, ne, f(nwValue * nw)))
			);
		}
	}
	return { left, top, right: left + cropWidth, bottom: top + cropHeight, values: crop };
}

/**
 * The mask of a detection: logits[at..at + m * m) are its mask head logits (m x m, row-major), box[4b..]
 * its box, pasted into an image of height x width. Returns the runs of the thresholded mask and its area.
 */
export function pasteMask(
	logits: Float32Array,
	at: number,
	m: number,
	box: Float32Array,
	b: number,
	height: number,
	width: number
): PastedMask {
	if (probabilities.length < m * m) probabilities = new Float32Array(m * m);
	for (let i = 0; i < m * m; i++) probabilities[i] = torchSigmoid(logits[at + i]);
	const { left, top, right, bottom, values } = pasteProbabilities(
		probabilities,
		m,
		box,
		b,
		height,
		width
	);
	const cropWidth = right - left,
		cropHeight = bottom - top;

	const runs: number[] = [];
	let value = 0,
		length = left * height + top,
		area = 0;
	const gap = height - cropHeight;
	for (let i = 0; i < cropWidth; i++) {
		if (i > 0 && gap > 0) {
			if (value === 0) length += gap;
			else {
				runs.push(length);
				value = 0;
				length = gap;
			}
		}
		for (let j = 0; j < cropHeight; j++) {
			const v = values[i * cropHeight + j] >= 0.5 ? 1 : 0;
			area += v;
			if (v === value) length++;
			else {
				runs.push(length);
				value = v;
				length = 1;
			}
		}
	}
	const tail =
		cropWidth > 0 && cropHeight > 0
			? gap - top + (width - right) * height
			: height * width - length;
	if (value === 0) runs.push(length + tail);
	else {
		runs.push(length);
		if (tail > 0) runs.push(tail);
	}
	return { runs: Uint32Array.from(runs), area };
}
