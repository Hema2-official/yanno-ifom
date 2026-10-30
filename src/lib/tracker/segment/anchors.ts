/**
 * detectron2's DefaultAnchorGenerator for the model's configuration: one anchor size per FPN level (32
 * to 512 for p2 to p6, strides 4 to 64), aspect ratios 0.5, 1 and 2, offset 0. The anchors of a level are
 * in the RPN head's flattened order, (row * width + column) * 3 + ratio, four float32 entries each.
 */

const f = Math.fround;

export const ANCHOR_SIZES = [32, 64, 128, 256, 512] as const;
export const ANCHOR_STRIDES = [4, 8, 16, 32, 64] as const;
export const ASPECT_RATIOS = [0.5, 1, 2] as const;

/** generate_cell_anchors for one size: computed in double, as Python does, then stored as float32. */
function cellAnchors(size: number): number[] {
	const anchors: number[] = [];
	const area = size ** 2;
	for (const ratio of ASPECT_RATIOS) {
		const w = Math.sqrt(area / ratio);
		const h = ratio * w;
		anchors.push(f(-w / 2), f(-h / 2), f(w / 2), f(h / 2));
	}
	return anchors;
}

/** The anchors of FPN level `level` (0 for p2) on a grid of gridHeight x gridWidth cells. */
export function levelAnchors(level: number, gridHeight: number, gridWidth: number): Float32Array {
	const cell = cellAnchors(ANCHOR_SIZES[level]);
	const stride = ANCHOR_STRIDES[level];
	const count = ASPECT_RATIOS.length;
	const anchors = new Float32Array(gridHeight * gridWidth * count * 4);
	for (let y = 0; y < gridHeight; y++) {
		for (let x = 0; x < gridWidth; x++) {
			const base = (y * gridWidth + x) * count * 4;
			for (let a = 0; a < count; a++) {
				anchors[base + 4 * a] = f(x * stride + cell[4 * a]);
				anchors[base + 4 * a + 1] = f(y * stride + cell[4 * a + 1]);
				anchors[base + 4 * a + 2] = f(x * stride + cell[4 * a + 2]);
				anchors[base + 4 * a + 3] = f(y * stride + cell[4 * a + 3]);
			}
		}
	}
	return anchors;
}
