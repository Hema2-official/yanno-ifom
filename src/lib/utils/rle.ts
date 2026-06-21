import type { RLEType } from '$lib/types/annotation.type';
import type { Polygon } from '$lib/types/geometry.type';

function countsToString(counts: number[]) {
	// Similar to LEB128 but using 6 bits/char and ASCII chars 48-111.
	let result = '';

	for (let i = 0; i < counts.length; i++) {
		let x = counts[i];
		if (i > 2) x -= counts[i - 2];
		let more = true;

		while (more) {
			let c = x & 0x1f; // Extract the lowest 5 bits
			x >>= 5; // Shift the value by 5 bits
			more = c & 0x10 ? x !== -1 : x !== 0; // Check continuation
			if (more) c |= 0x20; // Set the continuation bit if needed
			c += 48; // Offset to printable ASCII
			result += String.fromCharCode(c);
		}
	}

	return result;
}

function stringToCounts(source: string) {
	const m = source.length;
	let p = 0; // Current position in the string

	const counts = new Int32Array(m);
	let countsLen = 0;

	// Decode the run-length encoding
	while (p < m) {
		let x = 0; // Current decoded value
		let shift = 0; // Bit offset for the current 5-bit block
		let more = true;

		while (more) {
			const c = source.charCodeAt(p) - 48; // Convert ASCII to integer
			x |= (c & 0x1f) << shift; // Append the 5-bit block
			more = (c & 0x20) !== 0; // Check if the continuation bit is set
			p++;
			shift += 5;

			if (!more && c & 0x10) {
				// If the sign bit is set, extend the sign
				x |= -1 << shift;
			}
		}

		// Adjust value based on previous counts
		if (countsLen > 2) {
			x += counts[countsLen - 2];
		}

		// Store the decoded value
		counts[countsLen++] = x;
	}

	// Return a view over the filled portion (no copy)
	return counts.subarray(0, countsLen);
}

/**
 * Decode RLE data into a binary mask.
 * @param rle RLE object
 */
export function rleToMask(rle: RLEType) {
	const counts = stringToCounts(rle.counts);

	const rows = rle.size[0];
	const cols = rle.size[1];
	const result = new Uint8Array(rows * cols);

	let pos = 0; // linear position in column-major order
	let value = 0; // current RLE value (alternates 0/1, starts at 0)

	for (const count of counts) {
		if (value === 1) {
			// Only write 1s — 0s are already the default in the Uint8Array
			const end = pos + count;
			let col = Math.trunc(pos / rows);
			let row = pos - col * rows; // pos % rows without modulo
			// Track output index incrementally to avoid a multiply per pixel
			let outIdx = row * cols + col;

			for (let j = pos; j < end; j++) {
				result[outIdx] = 1;
				row++;
				outIdx += cols; // next row in row-major = +cols
				if (row >= rows) {
					row = 0;
					col++;
					outIdx = col; // row=0, so outIdx = 0*cols + col = col
				}
			}
			pos = end;
		} else {
			pos += count;
		}

		value = 1 - value; // Toggle value
	}

	return result;
}

/**
 * Encode a binary mask into RLE format.
 * @param mask Binary mask of size height * width
 * @param size Size of the mask in [height, width]
 */
export function maskToRle(mask: Uint8Array, size: [number, number]) {
	const area = size[0] * size[1]; // Total pixels per mask
	const counts: number[] = new Array(area + 1);

	let index = 0;
	let prevPixel = 0;
	let currentLength = 0;

	for (let j = 0; j < area; j++) {
		if (mask[j] !== prevPixel) {
			counts[index++] = currentLength;
			currentLength = 0;
			prevPixel = mask[j];
		}
		currentLength++;
	}

	counts[index++] = currentLength; // Final run length

	return {
		size,
		counts: countsToString(counts.slice(0, index))
	};
}

export function maskToPolygons(mask: Uint8Array, size: [number, number]): Polygon[] {
	const height = size[0];
	const width = size[1];
	const visited = new Uint8Array(mask.length);
	const polygons: Polygon[] = [];

	// Directions for 8-connectivity in clockwise order
	const dx = [1, 1, 0, -1, -1, -1, 0, 1];
	const dy = [0, 1, 1, 1, 0, -1, -1, -1];

	function getDirIndex(fromX: number, fromY: number, toX: number, toY: number): number {
		const diffX = toX - fromX;
		const diffY = toY - fromY;
		for (let i = 0; i < 8; i++) {
			if (dx[i] === diffX && dy[i] === diffY) return i;
		}
		return -1;
	}

	function followBoundary(startX: number, startY: number): Polygon {
		const polygon: Polygon = [];

		let cx = startX;
		let cy = startY;
		let px = startX - 1;
		let py = startY;

		const startState = { cx, cy, px, py };
		polygon.push({ x: cx, y: cy });

		let limit = 100000;
		while (limit-- > 0) {
			const pDir = getDirIndex(cx, cy, px, py);
			let foundNext = false;
			let nextCx = cx;
			let nextCy = cy;
			let nextPx = px;
			let nextPy = py;

			for (let i = 1; i <= 8; i++) {
				const dir = (pDir + i) % 8;
				const nx = cx + dx[dir];
				const ny = cy + dy[dir];

				const inBounds = nx >= 0 && nx < width && ny >= 0 && ny < height;
				const isOne = inBounds && mask[ny * width + nx] === 1;

				if (isOne) {
					nextCx = nx;
					nextCy = ny;
					foundNext = true;
					break;
				} else {
					nextPx = nx;
					nextPy = ny;
				}
			}

			if (!foundNext) {
				break;
			}

			cx = nextCx;
			cy = nextCy;
			px = nextPx;
			py = nextPy;

			if (cx === startState.cx && cy === startState.cy && px === startState.px && py === startState.py) {
				break;
			}

			polygon.push({ x: cx, y: cy });
		}

		// Flood fill the connected component to mark all its pixels as visited
		if (polygon.length > 0) {
			const queue: [number, number][] = polygon.map((p) => [p.x, p.y]);
			for (const p of polygon) {
				visited[p.y * width + p.x] = 1;
			}
			let head = 0;
			while (head < queue.length) {
				const [cx, cy] = queue[head++];
				for (let i = 0; i < 8; i++) {
					const nx = cx + dx[i];
					const ny = cy + dy[i];
					if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
						const nIdx = ny * width + nx;
						if (mask[nIdx] === 1 && visited[nIdx] === 0) {
							visited[nIdx] = 1;
							queue.push([nx, ny]);
						}
					}
				}
			}
		}

		return polygon;
	}

	for (let y = 0; y < height; y++) {
		const rowStart = y * width;
		for (let x = 0; x < width; x++) {
			const index = rowStart + x;
			if (mask[index] === 1 && visited[index] === 0) {
				const polygon = followBoundary(x, y);
				if (polygon.length > 0) polygons.push(polygon);
			}
		}
	}

	return polygons;
}

export function getPolygonSize(polygon: Polygon) {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const p of polygon) {
		if (p.x < minX) minX = p.x;
		if (p.x > maxX) maxX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.y > maxY) maxY = p.y;
	}
	return (maxX - minX) * (maxY - minY);
}

export function rleToPolygons(rle: RLEType) {
	return maskToPolygons(rleToMask(rle), rle.size);
}

const mask = [
	[0, 1, 1, 0],
	[0, 1, 1, 0],
	[1, 1, 1, 0],
	[0, 1, 0, 0]
];
const height = 4;
const width = 4;

const polygons = maskToPolygons(new Uint8Array(mask.flat()), [height, width]);
console.debug('polygons', polygons);
