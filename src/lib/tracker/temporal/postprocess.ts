/**
 * The objects of the temporal network's maps, as training/postprocess.py's instances() makes them
 * (ADOPTED_PIPELINE.md section 6.8), working from what the GPU leaves of the maps (temporal/segmenter.ts):
 * - the seeds' pixels become runs per row and their 4-connected components, by union-find over the
 *   runs of neighbouring rows, numbered as cv2.connectedComponents numbers them: by first pixel in
 *   raster order. Seeds under the minimum size are dropped;
 * - skimage's watershed on the negative distance floods from the seeds over the mask. It is ported with
 *   its binary heap, step for step, because seed pixels of equal value tie in the heap, and with its
 *   rule that a pixel costs at least what the pixel that reached it costs;
 * - objects under the minimum area are removed, and the others become runs, in label order.
 * All arrays are allocated once. The label plane is column-major, with a one-pixel margin that is
 * never flooded, like skimage's padding.
 */
import { sigmoidAtLeastThreshold, sigmoidThreshold, torchSigmoid } from '../math/float32';
import { encodeBits } from '../rle/bits';
import { columnSegments } from '../rle/rle';

export interface InstanceParams {
	/** seeds with fewer pixels are dropped */
	readonly minSeed: number;
	/** objects with fewer pixels are removed */
	readonly minArea: number;
}

/** The maps as the GPU returns them. */
export interface ReducedMaps {
	/**
	 * The distance map's logits in the padded column-major layout of paddedIndex, needed in the mask only;
	 * with `negated`, the negative distances themselves. The flood overwrites them.
	 */
	readonly distance: Float32Array;
	readonly negated?: boolean;
	/** the mask (foreground > threshold), bit-packed column-major (bits.ts) */
	readonly mask: Uint32Array;
	/** the seeds, bit-packed row-major: pixel i = y * width + x is bit i % 32 of word i >> 5 */
	readonly seeds: Uint32Array;
}

/** A pixel's place in the label plane and the distances. */
export function paddedIndex(y: number, x: number, height: number): number {
	return (x + 1) * (height + 2) + y + 1;
}

const OUTSIDE = -1;

export class InstanceExtractor {
	private readonly stride: number;
	private readonly labels: Int32Array;
	private readonly ages: Int32Array;
	private readonly heap: Int32Array;
	private values: Float32Array = new Float32Array(0);
	private heapSize = 0;
	private runCount = 0;
	private components = 0;
	// the seeds' runs in raster order, with their union-find parents and labels
	private runRow = new Int32Array(4096);
	private runStart = new Int32Array(4096);
	private runEnd = new Int32Array(4096);
	private parent = new Int32Array(4096);
	private runLabel = new Int32Array(4096);
	private pixels = new Int32Array(1024);
	private areas = new Int32Array(1024);
	private numbers = new Int32Array(1024);
	// the objects' column segments in column-major order: object, first pixel, end pixel (without the margin)
	private segments = new Int32Array(3 * 4096);

	constructor(
		readonly height: number,
		readonly width: number,
		readonly params: InstanceParams
	) {
		this.stride = height + 2;
		const pixels = this.stride * (width + 2);
		this.labels = new Int32Array(pixels);
		this.ages = new Int32Array(pixels);
		this.heap = new Int32Array(pixels);
	}

	/** The runs of the frame's objects, in label order. */
	objects(maps: ReducedMaps): Uint32Array[] {
		this.seedComponents(maps.seeds);
		const seeds = this.keepSeeds();
		this.markMask(maps);
		this.flood(maps.distance, seeds);
		return this.encode(seeds);
	}

	/** The seeds' runs and their components: each run's label is its component's number, from 1. */
	private seedComponents(words: Uint32Array): void {
		const { height: h, width: w } = this;
		let runs = 0,
			previous = 0;
		for (let y = 0; y < h; y++) {
			const first = runs;
			runs = this.rowRuns(words, y * w, w, y, runs);
			// runs of this row and the one above that share a column are one component; the root is the earliest run
			let above = previous;
			for (let r = first; r < runs; r++) {
				while (above < first && this.runEnd[above] <= this.runStart[r]) above++;
				for (let a = above; a < first && this.runStart[a] < this.runEnd[r]; a++)
					this.union(a, r);
			}
			previous = first;
		}
		let components = 0;
		if (this.pixels.length < runs + 1) this.pixels = new Int32Array(2 * runs + 1);
		this.pixels.fill(0);
		for (let r = 0; r < runs; r++) {
			const root = this.find(r);
			const label = root === r ? ++components : this.runLabel[root];
			this.runLabel[r] = label;
			this.pixels[label] += this.runEnd[r] - this.runStart[r];
		}
		this.runCount = runs;
		this.components = components;
	}

	/** Appends the ones of the n bits from bit offset `first` as runs of row y; returns the new run count. */
	private rowRuns(words: Uint32Array, first: number, n: number, y: number, runs: number): number {
		const lastBit = first + n;
		let bit = first;
		while (bit < lastBit) {
			const word = words[bit >>> 5] >>> (bit & 31);
			if (word === 0) {
				bit = ((bit >>> 5) + 1) * 32;
				continue;
			}
			// the next one, then the zero after it
			bit += 31 - Math.clz32(word & -word);
			if (bit >= lastBit) break;
			let end = bit + 1;
			while (end < lastBit) {
				const rest = ~words[end >>> 5] >>> (end & 31);
				if (rest !== 0) {
					end += 31 - Math.clz32(rest & -rest);
					break;
				}
				end = ((end >>> 5) + 1) * 32;
			}
			if (end > lastBit) end = lastBit;
			if (runs === this.runRow.length) this.growRuns();
			this.runRow[runs] = y;
			this.runStart[runs] = bit - first;
			this.runEnd[runs] = end - first;
			this.parent[runs] = runs;
			runs++;
			bit = end;
		}
		return runs;
	}

	private growRuns(): void {
		const grow = (a: Int32Array) => {
			const b = new Int32Array(2 * a.length);
			b.set(a);
			return b;
		};
		this.runRow = grow(this.runRow);
		this.runStart = grow(this.runStart);
		this.runEnd = grow(this.runEnd);
		this.parent = grow(this.parent);
		this.runLabel = grow(this.runLabel);
	}

	private find(r: number): number {
		const parent = this.parent;
		while (parent[r] !== r) {
			parent[r] = parent[parent[r]];
			r = parent[r];
		}
		return r;
	}

	private union(a: number, b: number): void {
		const ra = this.find(a),
			rb = this.find(b);
		if (ra < rb) this.parent[rb] = ra;
		else this.parent[ra] = rb;
	}

	/**
	 * Gives the kept seeds consecutive numbers in component order, which keeps the order of the labels,
	 * and returns how many there are. Runs of dropped seeds get the label 0.
	 */
	private keepSeeds(): number {
		const { pixels, runLabel, components } = this;
		if (this.numbers.length <= components) {
			this.numbers = new Int32Array(2 * components + 1);
			this.areas = new Int32Array(2 * components + 1);
		}
		let kept = 0;
		for (let c = 1; c <= components; c++)
			this.numbers[c] = pixels[c] >= this.params.minSeed ? ++kept : 0;
		for (let r = 0; r < this.runCount; r++) runLabel[r] = this.numbers[runLabel[r]];
		return kept;
	}

	/** Sets the label plane, the mask's pixels to 0 and everything else to outside, and the mask's negative distances. */
	private markMask(maps: ReducedMaps): void {
		const { height: h, stride, labels } = this;
		const distance = maps.distance;
		labels.fill(OUTSIDE);
		const { segments, count } = columnSegments(encodeBits(maps.mask, h, this.width), h);
		for (let k = 0; k < count; k++) {
			const column = (segments[3 * k] + 1) * stride + 1;
			const start = column + segments[3 * k + 1],
				end = column + segments[3 * k + 2] + 1;
			labels.fill(0, start, end);
			if (!maps.negated)
				for (let p = start; p < end; p++) distance[p] = -torchSigmoid(distance[p]);
		}
	}

	/** watershed_raveled, without compactness and watershed lines. */
	private flood(values: Float32Array, seeds: number): void {
		const { labels, ages, heap, stride, areas } = this;
		this.values = values;
		this.heapSize = 0;
		areas.fill(0, 0, seeds + 1);
		// the markers, in raster order
		for (let r = 0; r < this.runCount; r++) {
			const label = this.runLabel[r];
			if (label === 0) continue;
			const y = this.runRow[r];
			for (let x = this.runStart[r]; x < this.runEnd[r]; x++) {
				const p = (x + 1) * stride + y + 1;
				labels[p] = label;
				ages[p] = 0;
				this.push(p);
			}
			areas[label] += this.runEnd[r] - this.runStart[r];
		}
		let age = 1;
		// skimage's neighbours in its order: up, left, right, down
		const neighbours = [-1, -stride, stride, 1];
		while (this.heapSize > 0) {
			const p = heap[0];
			this.pop();
			const value = values[p],
				label = labels[p];
			for (let i = 0; i < 4; i++) {
				const n = p + neighbours[i];
				if (labels[n] !== 0) continue;
				age++;
				labels[n] = label;
				areas[label]++;
				// a pixel costs at least what the pixel that reached it costs
				if (values[n] < value) values[n] = value;
				ages[n] = age;
				this.push(n);
			}
		}
	}

	/** The order of the heap: by value, then by age; markers of one value tie, and the heap's shape decides. */
	private smaller(a: number, b: number): boolean {
		const va = this.values[a],
			vb = this.values[b];
		if (va !== vb) return va < vb;
		return this.ages[a] < this.ages[b];
	}

	private push(p: number): void {
		const heap = this.heap;
		let child = this.heapSize++;
		heap[child] = p;
		while (child > 0) {
			const parent = ((child + 1) >> 1) - 1;
			if (!this.smaller(heap[child], heap[parent])) break;
			const swap = heap[parent];
			heap[parent] = heap[child];
			heap[child] = swap;
			child = parent;
		}
	}

	private pop(): void {
		const heap = this.heap;
		const items = --this.heapSize;
		if (items === 0) return;
		heap[0] = heap[items];
		let i = 0,
			smallest = 0;
		for (;;) {
			const l = 2 * i + 1,
				r = l + 1;
			if (l >= items) break;
			if (this.smaller(heap[l], heap[i])) smallest = l;
			if (r < items && this.smaller(heap[r], heap[smallest])) smallest = r;
			if (smallest === i) break;
			const swap = heap[i];
			heap[i] = heap[smallest];
			heap[smallest] = swap;
			i = smallest;
		}
	}

	/** The kept objects as runs: one scan of the label plane into column segments, then the segments object by object. */
	private encode(seeds: number): Uint32Array[] {
		const { height: h, width: w, stride, labels, areas, numbers } = this;
		let objects = 0;
		for (let label = 1; label <= seeds; label++)
			numbers[label] = areas[label] >= this.params.minArea ? ++objects : 0;
		const segmentsOf = new Int32Array(objects + 1);
		let count = 0;
		let segments = this.segments;
		for (let x = 0; x < w; x++) {
			const column = (x + 1) * stride + 1;
			let y = 0;
			while (y < h) {
				const label = labels[column + y];
				if (label <= 0) {
					y++;
					continue;
				}
				const start = y;
				while (y < h && labels[column + y] === label) y++;
				const object = numbers[label];
				if (object === 0) continue;
				if (3 * count + 3 > segments.length) {
					const grown = new Int32Array(2 * segments.length);
					grown.set(segments);
					this.segments = segments = grown;
				}
				segments[3 * count] = object;
				segments[3 * count + 1] = x * h + start;
				segments[3 * count + 2] = x * h + y;
				segmentsOf[object]++;
				count++;
			}
		}
		const runs: Uint32Array[] = new Array(objects);
		const filled = new Int32Array(objects + 1);
		const ends = new Int32Array(objects + 1);
		for (let object = 1; object <= objects; object++)
			runs[object - 1] = new Uint32Array(2 * segmentsOf[object] + 1);
		for (let k = 0; k < count; k++) {
			const object = segments[3 * k],
				start = segments[3 * k + 1],
				end = segments[3 * k + 2];
			const target = runs[object - 1];
			const n = filled[object];
			if (n > 0 && ends[object] === start) {
				// the run goes on into the next column
				target[n - 1] += end - start;
			} else {
				target[n] = start - ends[object];
				target[n + 1] = end - start;
				filled[object] = n + 2;
			}
			ends[object] = end;
		}
		const n = h * w;
		for (let object = 1; object <= objects; object++) {
			// like pycocotools, no zero run after a mask that ends with a one
			if (ends[object] < n) runs[object - 1][filled[object]++] = n - ends[object];
			runs[object - 1] = runs[object - 1].subarray(0, filled[object]);
		}
		return runs;
	}
}

/** The thresholds on the logits: from here on sigmoid > 0.5, and from here on it is no longer < 0.5. */
export const ABOVE_HALF = sigmoidThreshold(0.5);
export const NOT_BELOW_HALF = sigmoidAtLeastThreshold(0.5);

/**
 * The GPU's reduction of the logits (temporal/segmenter.ts), on the CPU. The logits are (3, H, W)
 * row-major: foreground, boundary, distance. The mask is fg > 0.5, the seeds lie inside it with
 * dist > 0.5 and boundary < 0.5, all as the sigmoid's float32 results compare.
 */
export function reduceLogits(logits: Float32Array, height: number, width: number): ReducedMaps {
	const plane = height * width;
	const distance = new Float32Array((height + 2) * (width + 2));
	const mask = new Uint32Array(Math.ceil(plane / 32)),
		seeds = new Uint32Array(Math.ceil(plane / 32));
	for (let y = 0, q = 0; y < height; y++) {
		for (let x = 0; x < width; x++, q++) {
			distance[paddedIndex(y, x, height)] = logits[2 * plane + q];
			if (logits[q] < ABOVE_HALF) continue;
			const p = x * height + y;
			mask[p >>> 5] |= 1 << (p & 31);
			if (logits[2 * plane + q] >= ABOVE_HALF && logits[plane + q] < NOT_BELOW_HALF)
				seeds[q >>> 5] |= 1 << (q & 31);
		}
	}
	return { distance, mask, seeds };
}
