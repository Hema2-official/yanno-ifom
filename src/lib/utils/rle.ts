import type { RLEType } from '$lib/types/annotation.type';

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
	let m = 0; // Temporary count for number of characters in `s`
	let p = 0; // Current position in the string `s`
	const counts: number[] = []; // Array to hold decoded values

	// Calculate the length of the string
	m = source.length;

	// Decode the run-length encoding
	while (p < m) {
		let x = 0; // Current decoded value
		let k = 0; // Position of the 5-bit block
		let more = true;

		while (more) {
			const c = source.charCodeAt(p) - 48; // Convert ASCII to integer
			x |= (c & 0x1f) << (5 * k); // Append the 5-bit block
			more = (c & 0x20) !== 0; // Check if the continuation bit is set
			p++;
			k++;

			if (!more && c & 0x10) {
				// If the sign bit is set, extend the sign
				x |= -1 << (5 * k);
			}
		}

		// Adjust value based on previous counts
		if (counts.length > 2) {
			x += counts[counts.length - 2];
		}

		// Store the decoded value
		counts.push(x);
	}

	return counts;
}

/**
 * Decode RLE data into a binary mask.
 * @param rle RLE object
 */
export function rleToMask(rle: RLEType) {
	const counts = stringToCounts(rle.counts);

	const mask = new Uint8Array(rle.size[0] * rle.size[1]);

	let index = 0;
	let value = 0;

	for (let j = 0; j < counts.length; j++) {
		for (let k = 0; k < counts[j]; k++) {
			mask[index++] = value;
		}
		value = 1 - value; // Toggle value
	}

	return mask;
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

type Point = { x: number; y: number };
type Polygon = Point[];

export function maskToPolygons(mask: Uint8Array, size: [number, number]): Polygon[] {
	const visited = new Array(mask.length).fill(false);
	const polygons: Polygon[] = [];

	// Directions for 8-connectivity in clockwise order
	const directions = [
		{ dx: 1, dy: 0 }, // Right
		{ dx: 1, dy: 1 }, // Down-Right
		{ dx: 0, dy: 1 }, // Down
		{ dx: -1, dy: 1 }, // Down-Left
		{ dx: -1, dy: 0 }, // Left
		{ dx: -1, dy: -1 }, // Up-Left
		{ dx: 0, dy: -1 }, // Up
		{ dx: 1, dy: -1 } // Up-Right
	];

	const getIndex = (x: number, y: number) => y * size[1] + x;

	const isInside = (x: number, y: number) =>
		x >= 0 && x < size[1] && y >= 0 && y < size[0] && mask[getIndex(x, y)] === 1;

	function followBoundary(startX: number, startY: number): Polygon {
		const polygon: Polygon = [];
		let x = startX;
		let y = startY;
		let directionIndex = 0;
		console.debug('startX', startX, 'startY', startY);

		let foundNext = false;
		do {
			polygon.push({ x, y });
			visited[getIndex(x, y)] = true;

			foundNext = false;
			for (let i = 0; i < 8; i++) {
				const dir = directions[(directionIndex + i) % 8];
				const nx = x + dir.dx;
				const ny = y + dir.dy;

				if (isInside(nx, ny) && !visited[getIndex(nx, ny)]) {
					x = nx;
					y = ny;
					directionIndex = (directionIndex + i) % 8; // Update direction index
					foundNext = true;
					break;
				}
			}

			// Check if we've returned to the start or its neighborhood
			if (polygon.length > 2 && Math.abs(x - startX) <= 1 && Math.abs(y - startY) <= 1) {
				if (x !== startX || y !== startY) {
					polygon.push({ x, y });
					visited[getIndex(x, y)] = true;
				}
				break;
			}
		} while (foundNext); // Stop when there are no more neighbors

		// Mark the inside of the polygon's rows as visited
		for (let i = 0; i < polygon.length; i++) {
			const p1 = polygon[i];
			const p2 = polygon[(i + 1) % polygon.length];

			const yMin = Math.min(p1.y, p2.y);
			const yMax = Math.max(p1.y, p2.y);

			for (let y = yMin; y <= yMax; y++) {
				visited[getIndex(p1.x, y)] = true;
			}
		}

		return polygon;
	}

	for (let y = 0; y < size[0]; y++) {
		for (let x = 0; x < size[1]; x++) {
			const index = getIndex(x, y);
			if (mask[index] === 1 && !visited[index]) {
				const polygon = followBoundary(x, y);
				if (polygon.length > 0) polygons.push(polygon);
			}
		}
	}

	return polygons;
}

const mask = [
	[0, 1, 1, 0],
	[0, 1, 1, 0],
	[1, 1, 1, 0],
	[0, 1, 0, 0]
];
const height = 4;
const width = 4;

const polygons = maskToPolygons(new Uint8Array(mask.flatMap((x) => x)), [height, width]);
console.debug('polygons', polygons);
