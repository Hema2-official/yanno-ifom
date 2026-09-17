import type { RLEType } from '$lib/types/annotation.type';
import type { Polygon } from '$lib/types/geometry.type';
import { getPolygonsBounds } from './geometry';

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

	for (let i = 0; i < counts.length; i++) {
		const count = counts[i];
		if (value === 1) {
			let remaining = count;
			let col = Math.trunc(pos / rows);
			let row = pos - col * rows;

			while (remaining > 0) {
				const colSpace = rows - row;
				const run = Math.min(remaining, colSpace);

				let outIdx = row * cols + col;
				const colStride = cols;

				for (let j = 0; j < run; j++) {
					result[outIdx] = 1;
					outIdx += colStride;
				}

				remaining -= run;
				row += run;
				if (row >= rows) {
					row = 0;
					col++;
				}
			}
			pos += count;
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
export function maskToRle(mask: Uint8Array, size: [number, number]): RLEType {
	const height = size[0];
	const width = size[1];
	const counts: number[] = [];

	let prevPixel = 0;
	let currentLength = 0;

	for (let col = 0; col < width; col++) {
		for (let row = 0; row < height; row++) {
			const pixel = mask[row * width + col];
			if (pixel !== prevPixel) {
				counts.push(currentLength);
				currentLength = 0;
				prevPixel = pixel;
			}
			currentLength++;
		}
	}

	counts.push(currentLength); // Final run length

	return {
		size,
		counts: countsToString(counts)
	};
}

/**
 * Rasterize polygons into an RLE-encoded binary mask.
 *
 * Each polygon is filled using an even-odd scanline algorithm, then its outline
 * is stroked into the mask so that boundary pixels traced by `maskToPolygons`
 * are always included (a `maskToPolygons` -> `polygonsToRle` round trip must not
 * shrink the mask).
 *
 * @param polygons Array of polygons ({x, y} vertex lists) to rasterize.
 * @param size The mask dimensions as [height, width].
 * @returns An RLEType object representing the union of the filled polygons.
 */
export function polygonsToRle(polygons: Polygon[], size: [number, number]): RLEType {
	const height = size[0];
	const width = size[1];
	const mask = new Uint8Array(height * width);

	// Scanline (even-odd) fill for each polygon.
	for (const polygon of polygons) {
		const n = polygon.length;
		if (n < 2) continue;

		for (let i = 0; i < n; i++) {
			const p1 = polygon[i];
			const p2 = polygon[(i + 1) % n];

			const x0 = Math.round(p1.x);
			const y0 = Math.round(p1.y);
			const x1 = Math.round(p2.x);
			const y1 = Math.round(p2.y);

			if (y0 === y1) continue; // skip horizontal edges

			const minY = Math.min(y0, y1);
			const maxY = Math.max(y0, y1);

			// Half-open [minY, maxY) avoids the double-toggle at shared vertices.
			for (let y = minY; y < maxY; y++) {
				if (y < 0 || y >= height) continue;
				const xIntersect = Math.round(x0 + ((x1 - x0) * (y - y0)) / (y1 - y0));
				const rowStart = y * width;
				for (let x = Math.max(0, xIntersect); x < width; x++) {
					mask[rowStart + x] = mask[rowStart + x] ? 0 : 1;
				}
			}
		}
	}

	// Stroke each polygon outline so the traced boundary is always set.
	for (const polygon of polygons) {
		const n = polygon.length;
		if (n < 1) continue;

		for (let i = 0; i < n; i++) {
			const p1 = polygon[i];
			const p2 = polygon[(i + 1) % n];

			let x0 = Math.round(p1.x);
			let y0 = Math.round(p1.y);
			const x1 = Math.round(p2.x);
			const y1 = Math.round(p2.y);

			// Simple DDA line rasterization.
			const dx = x1 - x0;
			const dy = y1 - y0;
			const steps = Math.max(Math.abs(dx), Math.abs(dy));

			if (steps === 0) {
				if (x0 >= 0 && x0 < width && y0 >= 0 && y0 < height) {
					mask[y0 * width + x0] = 1;
				}
				continue;
			}

			const xStep = dx / steps;
			const yStep = dy / steps;
			let fx = x0;
			let fy = y0;
			for (let s = 0; s <= steps; s++) {
				x0 = Math.round(fx);
				y0 = Math.round(fy);
				if (x0 >= 0 && x0 < width && y0 >= 0 && y0 < height) {
					mask[y0 * width + x0] = 1;
				}
				fx += xStep;
				fy += yStep;
			}
		}
	}

	return maskToRle(mask, size);
}

export function maskToPolygons(mask: Uint8Array, size: [number, number]): Polygon[] {
	const height = size[0];
	const width = size[1];
	const visited = new Uint8Array(mask.length);
	const polygons: Polygon[] = [];

	// Directions for 8-connectivity in clockwise order
	const dx = [1, 1, 0, -1, -1, -1, 0, 1];
	const dy = [0, 1, 1, 1, 0, -1, -1, -1];

	// Lookup table to get direction index from (diffY + 1) * 3 + (diffX + 1)
	const dirTable = new Int8Array([5, 6, 7, 4, -1, 0, 3, 2, 1]);

	function followBoundary(startX: number, startY: number): Polygon {
		const polygon: Polygon = [];

		let cx = startX;
		let cy = startY;
		let px = startX - 1;
		let py = startY;

		polygon.push({ x: cx, y: cy });

		const seenStates = new Map<number, number>(); // state -> index of its pixel in polygon
		let cycleStart = 0;

		let limit = 100000;
		while (limit-- > 0) {
			const pDir = dirTable[(py - cy + 1) * 3 + (px - cx + 1)];
			const stateKey = (cy * width + cx) * 8 + pDir;
			const seenAt = seenStates.get(stateKey);
			if (seenAt !== undefined) {
				cycleStart = seenAt;
				polygon.pop(); // the cycle's first pixel was pushed again on re-entry
				break;
			}
			seenStates.set(stateKey, polygon.length - 1);

			let foundNext = false;
			let nextCx = cx;
			let nextCy = cy;
			let nextPx = px;
			let nextPy = py;

			for (let i = 1; i <= 8; i++) {
				const dir = (pDir + i) & 7;
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

			polygon.push({ x: cx, y: cy });
		}
		if (limit < 0) throw new Error('Boundary tracing did not terminate');

		// Drop the lead-in before the cycle (normally empty: the start state is part of the cycle)
		if (cycleStart > 0) polygon.splice(0, cycleStart);

		// Flood fill the connected component to mark all its pixels as visited
		if (polygon.length > 0) {
			// Allocate a small initial queue, grow dynamically if needed
			let queueCapacity = Math.max(1024, polygon.length * 2);
			let queue = new Int32Array(queueCapacity);

			let tail = 0;
			for (let i = 0; i < polygon.length; i++) {
				const p = polygon[i];
				const idx = p.y * width + p.x;
				if (visited[idx] === 0) {
					visited[idx] = 1;
					queue[tail++] = idx;
				}
			}
			let head = 0;
			while (head < tail) {
				// Grow the queue once per loop iteration if we're near capacity
				if (tail + 8 >= queueCapacity) {
					const newQueue = new Int32Array(queueCapacity * 2);
					newQueue.set(queue);
					queue = newQueue;
					queueCapacity *= 2;
				}

				const idx = queue[head++];
				const cx = idx % width;
				const cy = Math.trunc(idx / width);

				if (cx > 0 && cx < width - 1 && cy > 0 && cy < height - 1) {
					// Fast path: all 8 neighbors are in-bounds
					const idx0 = idx + 1;
					if (mask[idx0] === 1 && visited[idx0] === 0) {
						visited[idx0] = 1;
						queue[tail++] = idx0;
					}
					const idx1 = idx + width + 1;
					if (mask[idx1] === 1 && visited[idx1] === 0) {
						visited[idx1] = 1;
						queue[tail++] = idx1;
					}
					const idx2 = idx + width;
					if (mask[idx2] === 1 && visited[idx2] === 0) {
						visited[idx2] = 1;
						queue[tail++] = idx2;
					}
					const idx3 = idx + width - 1;
					if (mask[idx3] === 1 && visited[idx3] === 0) {
						visited[idx3] = 1;
						queue[tail++] = idx3;
					}
					const idx4 = idx - 1;
					if (mask[idx4] === 1 && visited[idx4] === 0) {
						visited[idx4] = 1;
						queue[tail++] = idx4;
					}
					const idx5 = idx - width - 1;
					if (mask[idx5] === 1 && visited[idx5] === 0) {
						visited[idx5] = 1;
						queue[tail++] = idx5;
					}
					const idx6 = idx - width;
					if (mask[idx6] === 1 && visited[idx6] === 0) {
						visited[idx6] = 1;
						queue[tail++] = idx6;
					}
					const idx7 = idx - width + 1;
					if (mask[idx7] === 1 && visited[idx7] === 0) {
						visited[idx7] = 1;
						queue[tail++] = idx7;
					}
				} else {
					// Slow path with bounds checking
					for (let i = 0; i < 8; i++) {
						const nx = cx + dx[i];
						const ny = cy + dy[i];
						if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
							const nIdx = ny * width + nx;
							if (mask[nIdx] === 1 && visited[nIdx] === 0) {
								visited[nIdx] = 1;
								queue[tail++] = nIdx;
							}
						}
					}
				}
			}
		}

		return polygon;
	}

	const totalPixels = mask.length;
	for (let index = 0; index < totalPixels; index++) {
		if (mask[index] === 1 && visited[index] === 0) {
			const x = index % width;
			const y = Math.trunc(index / width);
			const polygon = followBoundary(x, y);
			if (polygon.length > 0) polygons.push(polygon);
		}
	}

	return polygons;
}

export function getPolygonSize(polygon: Polygon) {
	const bounds = getPolygonsBounds([polygon]);
	return (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
}

const polygonCache = new WeakMap<RLEType, { counts: string; polygons: Polygon[] }>();
export function rleToPolygons(rle: RLEType): Polygon[] {
	const cached = polygonCache.get(rle);
	if (cached && cached.counts === rle.counts) return cached.polygons;

	const polygons = maskToPolygons(rleToMask(rle), rle.size);
	polygonCache.set(rle, { counts: rle.counts, polygons });
	return polygons;
}
