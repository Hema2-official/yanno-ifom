import type { RLEType } from '$lib/types/annotation.type';
import type { Point } from '$lib/types/geometry.type';
import { maskToRle, rleToMask, rlePixels } from './rle';

/** The widest gap between cells, in pixels, that a merge bridges. */
const MAX_BRIDGE = 8;

/** Merge nearby cell masks into one continuous mask by filling in the small spaces between them. */
export function mergeMasks(rles: RLEType[]): RLEType {
	const [height, width] = rles[0].size;
	const result = new Uint8Array(width * height);
	for (const pixel of mergedPixels(rles.map(rlePixels), rles[0].size)) result[pixel] = 1;
	return maskToRle(result, rles[0].size);
}

/** `mergeMasks` on the masks' pixels (`rlePixels`), as indexes into a row-major image of `size`. */
export function mergedPixels(
	pixelsOf: Uint32Array[],
	[height, width]: RLEType['size']
): Uint32Array {
	// A window around the cells, with room for the closing
	let [minX, minY, maxX, maxY] = [width, height, -1, -1];
	for (const pixels of pixelsOf) {
		for (const i of pixels) {
			const x = i % width;
			const y = (i - x) / width;
			[minX, minY] = [Math.min(minX, x), Math.min(minY, y)];
			[maxX, maxY] = [Math.max(maxX, x), Math.max(maxY, y)];
		}
	}
	const left = Math.max(0, minX - MAX_BRIDGE - 1);
	const top = Math.max(0, minY - MAX_BRIDGE - 1);
	const w = Math.min(width, maxX + MAX_BRIDGE + 2) - left;
	const h = Math.min(height, maxY + MAX_BRIDGE + 2) - top;
	const masks = pixelsOf.map((pixels) => {
		const crop = new Uint8Array(w * h);
		for (const i of pixels) {
			const x = i % width;
			crop[((i - x) / width - top) * w + x - left] = 1;
		}
		return crop;
	});

	const union = new Uint8Array(w * h);
	for (const mask of masks) for (let i = 0; i < union.length; i++) union[i] |= mask[i];

	let merged: Uint8Array = union;
	let dilated: Uint8Array = union;
	const grown: Uint8Array[] = masks.map((mask) => mask.slice());
	for (let radius = 1; radius <= MAX_BRIDGE; radius++) {
		dilated = spread(dilated, w, h, 1);
		let closed = dilated;
		for (let i = 0; i < radius; i++) closed = spread(closed, w, h, 0);
		for (let k = 0; k < grown.length; k++) grown[k] = spread(grown[k], w, h, 1);

		merged = union.slice();
		for (let i = 0; i < merged.length; i++) {
			let near = 0;
			for (const mask of grown) near += mask[i];
			if (closed[i] && near > 1) merged[i] = 1;
		}
		if (pieces(merged, w, h).length === 1) break;
	}

	const result = new Uint32Array(merged.reduce((count, value) => count + value, 0));
	let n = 0;
	for (let i = 0; i < merged.length; i++) {
		if (!merged[i]) continue;
		const x = i % w;
		result[n++] = ((i - x) / w + top) * width + x + left;
	}
	return result;
}

/** Spreads the pixels of `value` to their 8 neighbours: a dilation for 1, an erosion for 0. */
function spread(mask: Uint8Array, width: number, height: number, value: 0 | 1): Uint8Array {
	// A 3x3 square is a pass along the rows, then one along the columns
	const rows = mask.slice();
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = y * width + x;
			if ((x > 0 && mask[i - 1] === value) || (x < width - 1 && mask[i + 1] === value)) {
				rows[i] = value;
			}
		}
	}
	const result = rows.slice();
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = y * width + x;
			if (
				(y > 0 && rows[i - width] === value) ||
				(y < height - 1 && rows[i + width] === value)
			) {
				result[i] = value;
			}
		}
	}
	return result;
}

/** Pieces of fewer pixels are slivers a cut leaves behind. */
const MIN_PIECE_PIXELS = 4;

/**
 * Splits a mask along a line (2px wide) into separate pieces,
 * sorted largest first (ignoring tiny slivers). Returns null if not split.
 */
export function cutMask(rle: RLEType, line: Point[]): RLEType[] | null {
	const [height, width] = rle.size;
	const mask = rleToMask(rle);
	const wholePieces = () =>
		pieces(mask, width, height).filter((piece) => piece.length >= MIN_PIECE_PIXELS);
	const before = wholePieces().length;

	const clear = (x: number, y: number) => {
		if (x >= 0 && x < width && y >= 0 && y < height) mask[y * width + x] = 0;
	};
	for (let i = 1; i < line.length; i++) {
		const { x: x0, y: y0 } = line[i - 1];
		const { x: x1, y: y1 } = line[i];
		// Half-pixel steps leave no gaps along the segment
		const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
		for (let s = 0; s <= steps; s++) {
			const x = Math.floor(x0 + ((x1 - x0) * s) / steps);
			const y = Math.floor(y0 + ((y1 - y0) * s) / steps);
			clear(x, y);
			clear(x + 1, y);
			clear(x, y + 1);
			clear(x + 1, y + 1);
		}
	}

	const after = wholePieces();
	if (after.length <= before) return null;
	return after
		.sort((a, b) => b.length - a.length)
		.map((piece) => {
			const pieceMask = new Uint8Array(mask.length);
			for (const i of piece) pieceMask[i] = 1;
			return maskToRle(pieceMask, rle.size);
		});
}

/** The pixel indexes of each 8-connected piece of the mask. */
function pieces(mask: Uint8Array, width: number, height: number): number[][] {
	const seen = new Uint8Array(mask.length);
	const result: number[][] = [];
	for (let start = 0; start < mask.length; start++) {
		if (!mask[start] || seen[start]) continue;
		const piece: number[] = [];
		const stack = [start];
		seen[start] = 1;
		while (stack.length > 0) {
			const i = stack.pop()!;
			piece.push(i);
			const x = i % width;
			const y = (i - x) / width;
			for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
				for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
					const j = ny * width + nx;
					if (mask[j] && !seen[j]) {
						seen[j] = 1;
						stack.push(j);
					}
				}
			}
		}
		result.push(piece);
	}
	return result;
}
