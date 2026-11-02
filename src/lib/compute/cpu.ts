/**
 * The tracker's GPU work on the CPU, for browsers without WebGPU: the models on ONNX Runtime's
 * WebAssembly backend, and the port's GPU kernels (the segmentation input, ROIAlign, the temporal
 * pass's input, the local tracks' input and threshold) as loops in the same float32 steps. The
 * CPU steps around them are the tracker's own.
 */
import * as ort from 'onnxruntime-web/webgpu';
import { sigmoidThreshold } from '$lib/tracker/math/float32';
import type { TrackType } from '$lib/tracker/output/records';
import { pack, pasteRuns, type MultiRle } from '$lib/tracker/rle/rle';
import { levelAnchors } from '$lib/tracker/segment/anchors';
import { detectBoxes, nonemptyDetections } from '$lib/tracker/segment/detections';
import { SIZE_DIVISIBILITY } from '$lib/tracker/segment/input';
import { pasteMask } from '$lib/tracker/segment/paste';
import {
	gatherDeltas,
	proposalsFromTop,
	RPN_PARAMS,
	topAnchors
} from '$lib/tracker/segment/proposals';
import { maskRecords } from '$lib/tracker/segment/records';
import { assignLevels, POOLED_LEVELS } from '$lib/tracker/segment/roialign';
import type { SegmentationModels, SegmentationParams } from '$lib/tracker/segment/segmenter';
import { BOUNDARY, FOREGROUND, HintBuilder } from '$lib/tracker/temporal/hints';
import {
	InstanceExtractor,
	reduceLogits,
	type InstanceParams
} from '$lib/tracker/temporal/postprocess';
import { temporalRecords } from '$lib/tracker/temporal/records';
import { REACH, type FirstPassFrame } from '$lib/tracker/temporal/segmenter';
import { WINDOW } from '$lib/tracker/track/crop';
import { PAD_MULTIPLE } from '$lib/tracker/track/kernel';
import { centroidMarker } from '$lib/tracker/track/marker';

const f = Math.fround;

// As in the tracker's segmenter
const LEVELS = ['p2', 'p3', 'p4', 'p5', 'p6'] as const;
const CHANNELS = 256;
const BOX_RESOLUTION = 7;
const MASK_RESOLUTION = 14;
const MASK_SIZE = 28;
const MAX_DETECTIONS = 1000;
const BOX_CHUNK = 1000;
const MASK_CHUNK = 64;

// detectron2's BGR means, each subtracted from the gray value, or from red, green and blue in turn as the tracker's `ImageInput` does
const PIXEL_MEAN = [103.53, 116.28, 123.675].map(f);

const sessionOptions: ort.InferenceSession.SessionOptions = {
	executionProviders: ['wasm'],
	graphOptimizationLevel: 'all'
};

/** The pycocotools runs of channel c of (channels, height, width) values at or above the threshold. */
function thresholdRuns(
	values: Float32Array,
	c: number,
	height: number,
	width: number,
	threshold: number
): Uint32Array {
	const runs: number[] = [];
	const base = c * height * width;
	let value = 0;
	let length = 0;
	for (let x = 0; x < width; x++) {
		for (let y = 0; y < height; y++) {
			const v = values[base + y * width + x] >= threshold ? 1 : 0;
			if (v === value) length++;
			else {
				runs.push(length);
				value = v;
				length = 1;
			}
		}
	}
	runs.push(length);
	return Uint32Array.from(runs);
}

let positions = new Int32Array(0);
let weights = new Float32Array(0);

/**
 * ROIAlign as the GPU kernel (roialign.ts) and torchvision's CPU roi_align compute it: boxes
 * from `first` on, n of them, each pooled at r x r from its level of `features`, into `out`
 * as (n, channels, r, r). The samples' positions and weights are worked out once per box, as
 * torchvision does, then applied to every channel.
 */
export function roiAlign(
	features: readonly Float32Array[],
	sizes: readonly (readonly [number, number])[],
	boxes: Float32Array,
	levels: Uint32Array,
	first: number,
	n: number,
	r: number,
	channels: number,
	out: Float32Array
): void {
	for (let i = 0; i < n; i++) {
		const box = first + i;
		const level = levels[box];
		const [height, width] = sizes[level];
		const scale = 1 / (4 << level);
		const startW = f(boxes[4 * box] * scale - 0.5);
		const startH = f(boxes[4 * box + 1] * scale - 0.5);
		const roiW = f(f(boxes[4 * box + 2] * scale - 0.5) - startW);
		const roiH = f(f(boxes[4 * box + 3] * scale - 0.5) - startH);
		const binW = f(roiW / r);
		const binH = f(roiH / r);
		const gridW = Math.max(Math.ceil(binW), 0);
		const gridH = Math.max(Math.ceil(binH), 0);
		const count = Math.max(gridW * gridH, 1);

		const samples = r * r * gridH * gridW;
		if (positions.length < 4 * samples) {
			positions = new Int32Array(4 * samples);
			weights = new Float32Array(4 * samples);
		}
		let s = 0;
		for (let ph = 0; ph < r; ph++) {
			for (let pw = 0; pw < r; pw++) {
				for (let iy = 0; iy < gridH; iy++) {
					const yy = f(f(startH + f(ph * binH)) + f(f((iy + 0.5) * binH) / gridH));
					for (let ix = 0; ix < gridW; ix++, s += 4) {
						let x = f(f(startW + f(pw * binW)) + f(f((ix + 0.5) * binW) / gridW));
						let y = yy;
						// torchvision's bilinear_interpolate: zero outside [-1, size], clamped to the last row and column
						if (y < -1 || y > height || x < -1 || x > width) {
							positions.fill(0, s, s + 4);
							weights.fill(0, s, s + 4);
							continue;
						}
						if (y <= 0) y = 0;
						if (x <= 0) x = 0;
						let yLow = Math.trunc(y);
						let xLow = Math.trunc(x);
						let yHigh = yLow + 1;
						let xHigh = xLow + 1;
						if (yLow >= height - 1) {
							yHigh = yLow = height - 1;
							y = yLow;
						}
						if (xLow >= width - 1) {
							xHigh = xLow = width - 1;
							x = xLow;
						}
						const ly = f(y - yLow);
						const lx = f(x - xLow);
						const hy = f(1 - ly);
						const hx = f(1 - lx);
						positions[s] = yLow * width + xLow;
						positions[s + 1] = yLow * width + xHigh;
						positions[s + 2] = yHigh * width + xLow;
						positions[s + 3] = yHigh * width + xHigh;
						weights[s] = hy * hx;
						weights[s + 1] = hy * lx;
						weights[s + 2] = ly * hx;
						weights[s + 3] = ly * lx;
					}
				}
			}
		}

		const data = features[level];
		const perBin = 4 * gridH * gridW;
		for (let c = 0; c < channels; c++) {
			const base = c * height * width;
			const target = (i * channels + c) * r * r;
			for (let bin = 0, p = 0; bin < r * r; bin++) {
				let sum = 0;
				for (const end = p + perBin; p < end; p += 4) {
					const value = f(
						f(
							f(
								f(weights[p] * data[base + positions[p]]) +
									f(weights[p + 1] * data[base + positions[p + 1]])
							) + f(weights[p + 2] * data[base + positions[p + 2]])
						) + f(weights[p + 3] * data[base + positions[p + 3]])
					);
					sum = f(sum + value);
				}
				out[target + bin] = sum / count;
			}
		}
	}
}

/** Segmentation of one frame at a time on the CPU, as the tracker's `Segmenter` does it on the GPU. */
export class CpuSegmenter {
	readonly paddedHeight: number;
	readonly paddedWidth: number;
	private readonly image: ort.Tensor;
	private readonly levelSizes: [number, number][];
	private readonly anchors: Float32Array[];
	private readonly boxPooled = new Float32Array(BOX_CHUNK * CHANNELS * BOX_RESOLUTION ** 2);
	private readonly maskPooled = new Float32Array(MASK_CHUNK * CHANNELS * MASK_RESOLUTION ** 2);

	private constructor(
		private readonly dense: ort.InferenceSession,
		private readonly box: ort.InferenceSession,
		private readonly mask: ort.InferenceSession,
		readonly height: number,
		readonly width: number,
		readonly params: SegmentationParams,
		readonly colors: 1 | 3
	) {
		this.paddedHeight = Math.ceil(height / SIZE_DIVISIBILITY) * SIZE_DIVISIBILITY;
		this.paddedWidth = Math.ceil(width / SIZE_DIVISIBILITY) * SIZE_DIVISIBILITY;
		this.image = new ort.Tensor(
			'float32',
			new Float32Array(3 * this.paddedHeight * this.paddedWidth),
			[1, 3, this.paddedHeight, this.paddedWidth]
		);
		this.levelSizes = LEVELS.map((_, l) => [
			this.paddedHeight >> (l + 2),
			this.paddedWidth >> (l + 2)
		]);
		this.anchors = this.levelSizes.map(([h, w], l) => levelAnchors(l, h, w));
	}

	static async create(
		models: SegmentationModels,
		height: number,
		width: number,
		params: SegmentationParams,
		colors: 1 | 3 = 1
	): Promise<CpuSegmenter> {
		const padded = (n: number) => Math.ceil(n / SIZE_DIVISIBILITY) * SIZE_DIVISIBILITY;
		const dense = await ort.InferenceSession.create(models.dense, {
			...sessionOptions,
			freeDimensionOverrides: { height: padded(height), width: padded(width) }
		});
		// The heads take each chunk's own number of rows, so no padded rows are computed
		const box = await ort.InferenceSession.create(models.box, sessionOptions);
		const mask = await ort.InferenceSession.create(models.mask, sessionOptions);
		return new CpuSegmenter(dense, box, mask, height, width, params, colors);
	}

	/** The records of frame `index` (height * width uint8 per color, row-major). */
	async segment(frame: Uint8Array, index: number): Promise<TrackType[]> {
		const { height, width, paddedHeight, paddedWidth, colors } = this;
		const image = this.image.data as Float32Array;
		const plane = paddedHeight * paddedWidth;
		for (let c = 0; c < 3; c++) {
			const mean = PIXEL_MEAN[c];
			const at = colors === 3 ? c : 0;
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					image[c * plane + y * paddedWidth + x] =
						frame[(y * width + x) * colors + at] - mean;
				}
			}
		}

		const dense = await this.dense.run({ image: this.image });
		const output = (name: string) => dense[name].data as Float32Array;
		const cells = this.levelSizes.map(([h, w]) => h * w);
		const tops = LEVELS.map((name, l) =>
			topAnchors(output(`objectness_${name}`), cells[l], RPN_PARAMS.preNmsTopk)
		);
		const topDeltas = new Float32Array(
			4 * tops.reduce((sum, top) => sum + top.anchors.length, 0)
		);
		let at = 0;
		LEVELS.forEach((name, l) => {
			gatherDeltas(output(`deltas_${name}`), cells[l], tops[l], topDeltas, at);
			at += tops[l].anchors.length;
		});
		const proposals = proposalsFromTop(tops, topDeltas, this.anchors, height, width);

		const features = LEVELS.slice(0, POOLED_LEVELS).map((name) => output(name));
		const sizes = this.levelSizes.slice(0, POOLED_LEVELS);
		const boxScores = new Float32Array(2 * proposals.count);
		const boxDeltas = new Float32Array(4 * proposals.count);
		const proposalLevels = assignLevels(proposals.boxes, proposals.count);
		for (let first = 0; first < proposals.count; first += BOX_CHUNK) {
			const n = Math.min(BOX_CHUNK, proposals.count - first);
			const size = CHANNELS * BOX_RESOLUTION ** 2;
			roiAlign(
				features,
				sizes,
				proposals.boxes,
				proposalLevels,
				first,
				n,
				BOX_RESOLUTION,
				CHANNELS,
				this.boxPooled
			);
			const pooled = new ort.Tensor('float32', this.boxPooled.subarray(0, n * size), [
				n,
				CHANNELS,
				BOX_RESOLUTION,
				BOX_RESOLUTION
			]);
			const out = await this.box.run({ pooled });
			boxScores.set(out.scores.data as Float32Array, 2 * first);
			boxDeltas.set(out.deltas.data as Float32Array, 4 * first);
		}
		const detections = detectBoxes(proposals, boxScores, boxDeltas, height, width, {
			scoreThreshold: this.params.scoreThreshold,
			nmsThreshold: 0.5,
			topk: MAX_DETECTIONS
		});

		const area = MASK_SIZE * MASK_SIZE;
		const maskLogits = new Float32Array(area * detections.count);
		const detectionLevels = assignLevels(detections.boxes, detections.count);
		for (let first = 0; first < detections.count; first += MASK_CHUNK) {
			const n = Math.min(MASK_CHUNK, detections.count - first);
			const size = CHANNELS * MASK_RESOLUTION ** 2;
			roiAlign(
				features,
				sizes,
				detections.boxes,
				detectionLevels,
				first,
				n,
				MASK_RESOLUTION,
				CHANNELS,
				this.maskPooled
			);
			const pooled = new ort.Tensor('float32', this.maskPooled.subarray(0, n * size), [
				n,
				CHANNELS,
				MASK_RESOLUTION,
				MASK_RESOLUTION
			]);
			const out = await this.mask.run({ pooled });
			maskLogits.set(out.mask_logits.data as Float32Array, area * first);
		}
		for (const tensor of Object.values(dense)) tensor.dispose();

		const masks = nonemptyDetections(detections).map((d) =>
			pasteMask(maskLogits, d * area, MASK_SIZE, detections.boxes, d, height, width)
		);
		return maskRecords(index, masks, this.params.minObjectSize, height, width);
	}

	async release(): Promise<void> {
		await Promise.all([this.dense.release(), this.box.release(), this.mask.release()]);
	}
}

// float32(float64(x) / 255) for every uint8 value x, the reference's PIXEL_VALUES
const PIXEL_VALUES = Float32Array.from({ length: 256 }, (_, x) => x / 255);

/** The tracker's `PlaneRing` in memory: plane `index` goes into slot index % slots, over the plane that many before it. */
class CpuRing {
	private readonly planes: Uint8Array[];
	private readonly indices: number[];

	constructor(slots: number, planeBytes: number) {
		this.planes = Array.from({ length: slots }, () => new Uint8Array(planeBytes));
		this.indices = new Array<number>(slots).fill(-1);
	}

	write(index: number, plane: Uint8Array): void {
		const slot = index % this.planes.length;
		this.planes[slot].set(plane);
		this.indices[slot] = index;
	}

	/** Plane `index`, which must be in the ring. */
	plane(index: number): Uint8Array {
		const slot = index % this.planes.length;
		if (this.indices[slot] !== index) throw new Error(`plane ${index} is not in the ring`);
		return this.planes[slot];
	}
}

// As in the tracker's temporal pass
const TEMPORAL_SLOTS = 2 * REACH + 1;
const TEMPORAL_CHANNELS = TEMPORAL_SLOTS + 4 * REACH;

/** The temporal pass on the CPU, as the tracker's `TemporalSegmenter` does it on the GPU. */
export class CpuTemporalSegmenter {
	private readonly frames: CpuRing;
	private readonly hints: CpuRing;
	private readonly hintBuilder: HintBuilder;
	private readonly hintPlane: Uint8Array;
	private readonly extractor: InstanceExtractor;
	private readonly input: ort.Tensor;

	private constructor(
		private readonly session: ort.InferenceSession,
		readonly numFrames: number,
		readonly height: number,
		readonly width: number,
		params: InstanceParams
	) {
		const plane = height * width;
		this.frames = new CpuRing(TEMPORAL_SLOTS, plane);
		this.hints = new CpuRing(TEMPORAL_SLOTS, plane);
		this.hintBuilder = new HintBuilder(height, width);
		this.hintPlane = new Uint8Array(plane);
		this.extractor = new InstanceExtractor(height, width, params);
		this.input = new ort.Tensor('float32', new Float32Array(TEMPORAL_CHANNELS * plane), [
			1,
			TEMPORAL_CHANNELS,
			height,
			width
		]);
	}

	static async create(
		model: Uint8Array,
		numFrames: number,
		height: number,
		width: number,
		params: InstanceParams
	): Promise<CpuTemporalSegmenter> {
		const session = await ort.InferenceSession.create(model, sessionOptions);
		return new CpuTemporalSegmenter(session, numFrames, height, width, params);
	}

	/** Yields [frame, records] for every frame, each as soon as the two frames after it have arrived. */
	async *run(firstPass: AsyncIterable<FirstPassFrame>): AsyncGenerator<[number, TrackType[]]> {
		let last = -1;
		for await (const { index, frame, records } of firstPass) {
			this.frames.write(index, frame);
			this.hintBuilder.build(records, this.hintPlane);
			this.hints.write(index, this.hintPlane);
			last = index;
			if (index >= REACH) yield [index - REACH, await this.objects(index - REACH)];
		}
		for (let t = Math.max(0, last - REACH + 1); t <= last; t++) {
			yield [t, await this.objects(t)];
		}
	}

	private async objects(t: number): Promise<TrackType[]> {
		const { height, width } = this;
		this.assemble(t);
		const { logits } = await this.session.run({ input: this.input });
		const maps = reduceLogits(logits.data as Float32Array, height, width);
		logits.dispose();
		return temporalRecords(t, this.extractor.objects(maps), height, width);
	}

	/**
	 * Writes frame t's channels: frames t-2 .. t+2, frame t standing in beyond the ends of the
	 * video, then foreground and boundary of the hints of t-2, t-1, t+1, t+2, zeros beyond the ends.
	 */
	private assemble(t: number): void {
		const input = this.input.data as Float32Array;
		const plane = this.height * this.width;
		for (let d = -REACH; d <= REACH; d++) {
			const frame = t + d;
			const inside = frame >= 0 && frame < this.numFrames;
			const pixels = this.frames.plane(inside ? frame : t);
			const image = (d + REACH) * plane;
			for (let i = 0; i < plane; i++) input[image + i] = PIXEL_VALUES[pixels[i]];
			if (d === 0) continue;

			const c = TEMPORAL_SLOTS + 2 * (d < 0 ? d + REACH : d + REACH - 1);
			const foreground = c * plane;
			const boundary = foreground + plane;
			if (!inside) {
				input.fill(0, foreground, boundary + plane);
				continue;
			}
			const hint = this.hints.plane(frame);
			for (let i = 0; i < plane; i++) {
				input[foreground + i] = hint[i] & FOREGROUND ? 1 : 0;
				input[boundary + i] = hint[i] & BOUNDARY ? 1 : 0;
			}
		}
	}

	async release(): Promise<void> {
		await this.session.release();
	}
}

/** The tracking model's local tracks on the CPU, as the tracker's `TrackingKernel` makes them on the GPU. */
export class CpuTrackingKernel {
	readonly paddedHeight: number;
	readonly paddedWidth: number;
	readonly frameChannels: number;
	/** Called after each object, for progress. */
	onObject?: () => void;
	private readonly ring: CpuRing;
	private readonly input: ort.Tensor;
	private readonly threshold: number;
	private marker: [number, number, number, number] = [0, 0, 0, 0];

	private constructor(
		private readonly session: ort.InferenceSession,
		readonly numFrames: number,
		readonly height: number,
		readonly width: number,
		readonly timeKernelSize: number,
		confidence: number
	) {
		this.paddedHeight = Math.ceil(height / PAD_MULTIPLE) * PAD_MULTIPLE;
		this.paddedWidth = Math.ceil(width / PAD_MULTIPLE) * PAD_MULTIPLE;
		this.frameChannels = 2 * timeKernelSize + 1;
		this.ring = new CpuRing(2 * timeKernelSize + 2, height * width);
		const plane = this.paddedHeight * this.paddedWidth;
		this.input = new ort.Tensor('float32', new Float32Array((this.frameChannels + 1) * plane), [
			1,
			this.frameChannels + 1,
			this.paddedHeight,
			this.paddedWidth
		]);
		this.threshold = sigmoidThreshold(confidence);
	}

	static async create(
		model: Uint8Array,
		numFrames: number,
		height: number,
		width: number,
		timeKernelSize: number,
		confidence: number
	): Promise<CpuTrackingKernel> {
		const session = await ort.InferenceSession.create(model, {
			...sessionOptions,
			freeDimensionOverrides: {
				height: Math.ceil(height / PAD_MULTIPLE) * PAD_MULTIPLE,
				width: Math.ceil(width / PAD_MULTIPLE) * PAD_MULTIPLE
			}
		});
		return new CpuTrackingKernel(session, numFrames, height, width, timeKernelSize, confidence);
	}

	/** Copies frame `index` (height * width uint8, row-major) into the ring, over the frame 2K + 2 before it. */
	uploadFrame(index: number, frame: Uint8Array): void {
		this.ring.write(index, frame);
	}

	/** The local tracks of the objects of frame g with the given centroids, as the GPU kernel's `localTracks`. */
	async localTracks(
		g: number,
		centroids: readonly (readonly [number, number])[]
	): Promise<MultiRle[]> {
		const tracks: MultiRle[] = [];
		if (centroids.length === 0) return tracks;
		this.assemble(g);
		for (const centroid of centroids) {
			this.moveMarker(centroidMarker(centroid, this.height, this.width));
			const { logits } = await this.session.run({ input: this.input });
			const values = logits.data as Float32Array;
			const channels: Uint32Array[] = [];
			for (let c = 0; c < this.frameChannels; c++) {
				channels.push(
					thresholdRuns(values, c, this.paddedHeight, this.paddedWidth, this.threshold)
				);
			}
			logits.dispose();
			tracks.push(pack(this.paddedHeight, this.paddedWidth, channels));
			this.onObject?.();
		}
		return tracks;
	}

	/** Writes the frame channels of frame g into the input: the central frame stands in beyond the ends. */
	private assemble(g: number): void {
		const input = this.input.data as Float32Array;
		const { height, width, paddedHeight, paddedWidth } = this;
		const plane = paddedHeight * paddedWidth;
		const k = this.timeKernelSize;
		for (let dt = -k; dt <= k; dt++) {
			const pixels = this.ring.plane(g + dt >= 0 && g + dt < this.numFrames ? g + dt : g);
			const channel = input.subarray((dt + k) * plane, (dt + k + 1) * plane);
			channel.fill(0);
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++)
					channel[y * paddedWidth + x] = PIXEL_VALUES[pixels[y * width + x]];
			}
		}
	}

	/** Clears the marker of the previous object and draws [top, bottom, left, right) at 1. */
	private moveMarker(next: [number, number, number, number]): void {
		const input = this.input.data as Float32Array;
		const channel = this.frameChannels * this.paddedHeight;
		const write = (
			[top, bottom, left, right]: [number, number, number, number],
			value: number
		) => {
			for (let y = top; y < bottom; y++) {
				const row = (channel + y) * this.paddedWidth;
				input.fill(value, row + left, row + right);
			}
		};
		write(this.marker, 0);
		write(next, 1);
		this.marker = next;
	}

	async release(): Promise<void> {
		await this.session.release();
	}
}

// Windows per model run, as the tracker's crop kernel
const CROP_CHUNK = 4;

/** The crop tracker's local tracks on the CPU, as the tracker's `CropTrackingKernel` makes them on the GPU. */
export class CpuCropTrackingKernel {
	readonly paddedHeight: number;
	readonly paddedWidth: number;
	readonly frameChannels: number;
	/** Called after each object, for progress. */
	onObject?: () => void;
	private readonly ring: CpuRing;
	private readonly input: Float32Array;
	private readonly threshold: number;

	private constructor(
		private readonly session: ort.InferenceSession,
		readonly numFrames: number,
		readonly height: number,
		readonly width: number,
		readonly timeKernelSize: number,
		confidence: number
	) {
		this.paddedHeight = Math.ceil(height / PAD_MULTIPLE) * PAD_MULTIPLE;
		this.paddedWidth = Math.ceil(width / PAD_MULTIPLE) * PAD_MULTIPLE;
		this.frameChannels = 2 * timeKernelSize + 1;
		this.ring = new CpuRing(2 * timeKernelSize + 2, height * width);
		this.input = new Float32Array(CROP_CHUNK * (this.frameChannels + 1) * WINDOW ** 2);
		this.threshold = sigmoidThreshold(confidence);
	}

	static async create(
		model: Uint8Array,
		numFrames: number,
		height: number,
		width: number,
		timeKernelSize: number,
		confidence: number
	): Promise<CpuCropTrackingKernel> {
		const session = await ort.InferenceSession.create(model, sessionOptions);
		return new CpuCropTrackingKernel(
			session,
			numFrames,
			height,
			width,
			timeKernelSize,
			confidence
		);
	}

	/** Copies frame `index` (height * width uint8, row-major) into the ring, over the frame 2K + 2 before it. */
	uploadFrame(index: number, frame: Uint8Array): void {
		this.ring.write(index, frame);
	}

	/** The local tracks of the objects of frame g with the given centroids, as the GPU kernel's `localTracks`. */
	async localTracks(
		g: number,
		centroids: readonly (readonly [number, number])[]
	): Promise<MultiRle[]> {
		const { frameChannels, paddedHeight, paddedWidth, height, width } = this;
		const half = WINDOW >> 1;
		const tracks: MultiRle[] = [];
		for (let first = 0; first < centroids.length; first += CROP_CHUNK) {
			const chunk = centroids.slice(first, first + CROP_CHUNK);
			chunk.forEach((centroid, i) => this.assemble(g, centroid, i));
			const values = chunk.length * (frameChannels + 1) * WINDOW ** 2;
			const input = new ort.Tensor('float32', this.input.subarray(0, values), [
				chunk.length,
				frameChannels + 1,
				WINDOW,
				WINDOW
			]);
			const { logits } = await this.session.run({ input });
			const output = logits.data as Float32Array;
			chunk.forEach(([cx, cy], i) => {
				const channels: Uint32Array[] = [];
				for (let c = 0; c < frameChannels; c++) {
					const runs = thresholdRuns(
						output,
						i * frameChannels + c,
						WINDOW,
						WINDOW,
						this.threshold
					);
					channels.push(
						pasteRuns(
							runs,
							WINDOW,
							paddedHeight,
							paddedWidth,
							cy - half,
							cx - half,
							height,
							width
						)
					);
				}
				tracks.push(pack(paddedHeight, paddedWidth, channels));
				this.onObject?.();
			});
			logits.dispose();
		}
		return tracks;
	}

	/**
	 * Writes window i of a chunk: the object's window out of the frames around g, the central frame
	 * standing in beyond the ends of the video and 0 beyond the frame, and the marker on the
	 * central 4 x 4 pixels.
	 */
	private assemble(g: number, [cx, cy]: readonly [number, number], i: number): void {
		const { height, width, frameChannels, input } = this;
		const k = this.timeKernelSize;
		const plane = WINDOW ** 2;
		const half = WINDOW >> 1;
		const top = cy - half;
		const left = cx - half;
		const base = i * (frameChannels + 1) * plane;
		for (let dt = -k; dt <= k; dt++) {
			const pixels = this.ring.plane(g + dt >= 0 && g + dt < this.numFrames ? g + dt : g);
			const channel = input.subarray(base + (dt + k) * plane, base + (dt + k + 1) * plane);
			channel.fill(0);
			const bottom = Math.min(WINDOW, height - top);
			const right = Math.min(WINDOW, width - left);
			for (let y = Math.max(0, -top); y < bottom; y++) {
				for (let x = Math.max(0, -left); x < right; x++) {
					channel[y * WINDOW + x] = PIXEL_VALUES[pixels[(top + y) * width + left + x]];
				}
			}
		}
		const marker = base + frameChannels * plane;
		input.fill(0, marker, marker + plane);
		for (let y = half - 2; y < half + 2; y++) {
			input.fill(1, marker + y * WINDOW + half - 2, marker + y * WINDOW + half + 2);
		}
	}

	async release(): Promise<void> {
		await this.session.release();
	}
}
