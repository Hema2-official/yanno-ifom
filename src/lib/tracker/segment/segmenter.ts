/**
 * Segmentation of one frame at a time on the GPU (DESIGN.md section 7), with ONNX Runtime Web's WebGPU
 * execution provider and the port's kernels on the same device:
 * 1. the frame is uploaded and normalized (ImageInput);
 * 2. the dense network (backbone, FPN, RPN head) runs; its outputs stay on the GPU, and only the
 *    objectness logits are read back;
 * 3. the top anchors of each level on the CPU, their deltas gathered on the GPU and read back, the
 *    proposals on the CPU;
 * 4. ROIAlign into the box head's input and the box head, in fixed chunks, their scores and deltas
 *    collected on the GPU and read back together;
 * 5. detections on the CPU;
 * 6. ROIAlign at 14 x 14 and the mask head, in chunks, the detections' logits collected and read back;
 * 7. masks pasted and encoded, records, on the CPU.
 * The networks always run at the same shapes; the last chunk's spare rows are computed but not read.
 * Reads go through one reused staging buffer into arrays allocated once. Every read waits for the GPU,
 * and a browser may deliver that only with its next display frame (16.7 ms at 60 Hz), so a frame reads
 * four times: the objectness, the gathered deltas, the box head's outputs, the mask head's.
 */
import * as ort from 'onnxruntime-web/webgpu';
import type { TrackType } from '../output/records';
import { levelAnchors } from './anchors';
import {
	detectBoxes,
	nonemptyDetections,
	type DetectionParams,
	type Detections
} from './detections';
import { DeltaGather } from './gather';
import { ImageInput, SIZE_DIVISIBILITY } from './input';
import { pasteMask, type PastedMask } from './paste';
import {
	proposalsFromTop,
	RPN_PARAMS,
	topAnchors,
	type Proposals,
	type TopAnchors
} from './proposals';
import { maskRecords } from './records';
import { assignLevels, POOLED_LEVELS, RoiAlign } from './roialign';

/** The RPN's input levels, p2 to p6. */
const LEVELS = ['p2', 'p3', 'p4', 'p5', 'p6'] as const;
const ANCHORS_PER_CELL = 3;
const BOX_RESOLUTION = 7,
	MASK_RESOLUTION = 14,
	MASK_SIZE = 28;
const MAX_DETECTIONS = 1000;

export interface SegmentationParams {
	/** the backend's score threshold (ROI_HEADS.SCORE_THRESH_TEST) */
	readonly scoreThreshold: number;
	/** masks with fewer pixels are dropped (PerformSegmentation's MinObjectSize); null keeps all */
	readonly minObjectSize: number | null;
}

/** The ONNX models of tools/export_models.py. */
export interface SegmentationModels {
	readonly dense: Uint8Array;
	readonly box: Uint8Array;
	readonly mask: Uint8Array;
}

export interface SegmenterOptions {
	/** proposals per box head run */
	readonly boxChunk?: number;
	/** detections per mask head run */
	readonly maskChunk?: number;
	/** ONNX Runtime's storageBufferCacheMode */
	readonly bufferCache?: 'disabled' | 'lazyRelease' | 'simple' | 'bucket';
	/** whether the networks' free dimensions are fixed to the frame and chunk sizes (default true) */
	readonly fixedShapes?: boolean;
	/** 1 for gray frames (the default), 3 for RGB ones */
	readonly colors?: 1 | 3;
}

/** A frame's intermediate results, for tests and diagnostics; the arrays are reused by the next frame. */
export interface FrameStages {
	/** each level's objectness logits, (A, height, width) */
	readonly objectness: readonly Float32Array[];
	readonly tops: readonly TopAnchors[];
	/** four deltas per top anchor */
	readonly topDeltas: Float32Array;
	readonly proposals: Proposals;
	readonly boxScores: Float32Array;
	readonly boxDeltas: Float32Array;
	readonly detections: Detections;
	readonly maskLogits: Float32Array;
	readonly masks: readonly PastedMask[];
}

/** Bytes read back from the GPU and milliseconds per stage, summed over the frames segmented. */
export interface SegmenterStats {
	frames: number;
	readBytes: number;
	ms: Record<'dense' | 'proposals' | 'gather' | 'box' | 'detections' | 'mask' | 'paste', number>;
}

interface Read {
	readonly buffer: GPUBuffer;
	readonly floats: number;
	readonly into: Float32Array;
	readonly at?: number;
}

/** Reads the start of GPU buffers into arrays, through one staging buffer that is reused and mapped once per call. */
class Reader {
	private staging: GPUBuffer | null = null;

	constructor(
		private readonly device: GPUDevice,
		private readonly stats: SegmenterStats
	) {}

	async read(parts: readonly Read[]): Promise<void> {
		const bytes = parts.reduce((sum, part) => sum + 4 * part.floats, 0);
		if (bytes === 0) return;
		if (!this.staging || this.staging.size < bytes) {
			this.staging?.destroy();
			this.staging = this.device.createBuffer({
				size: Math.max(bytes, 1 << 20),
				usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
			});
		}
		const encoder = this.device.createCommandEncoder();
		let offset = 0;
		for (const part of parts) {
			encoder.copyBufferToBuffer(part.buffer, 0, this.staging, offset, 4 * part.floats);
			offset += 4 * part.floats;
		}
		this.device.queue.submit([encoder.finish()]);
		await this.staging.mapAsync(GPUMapMode.READ, 0, bytes);
		const mapped = new Float32Array(this.staging.getMappedRange(0, bytes));
		offset = 0;
		for (const part of parts) {
			part.into.set(mapped.subarray(offset, offset + part.floats), part.at ?? 0);
			offset += part.floats;
		}
		this.staging.unmap();
		this.stats.readBytes += bytes;
	}

	destroy(): void {
		this.staging?.destroy();
	}
}

export class Segmenter {
	readonly stats: SegmenterStats = {
		frames: 0,
		readBytes: 0,
		ms: { dense: 0, proposals: 0, gather: 0, box: 0, detections: 0, mask: 0, paste: 0 }
	};
	private readonly input: ImageInput;
	private readonly gather: DeltaGather;
	private readonly boxAlign: RoiAlign;
	private readonly maskAlign: RoiAlign;
	private readonly reader: Reader;
	private readonly anchors: Float32Array[];
	private readonly levelSizes: [number, number][];
	private readonly imageTensor: ort.Tensor;
	private readonly boxTensor: ort.Tensor;
	private readonly maskTensor: ort.Tensor;
	private readonly detectionParams: DetectionParams;
	// allocated once, reused by every frame
	private readonly objectness: Float32Array[];
	private readonly topDeltas: Float32Array;
	private readonly boxScores = new Float32Array(2 * RPN_PARAMS.postNmsTopk);
	private readonly boxDeltas = new Float32Array(4 * RPN_PARAMS.postNmsTopk);
	private readonly maskLogits = new Float32Array(MASK_SIZE * MASK_SIZE * MAX_DETECTIONS);
	// the heads' outputs of all chunks of a frame, collected on the GPU
	private readonly boxScoresGpu: GPUBuffer;
	private readonly boxDeltasGpu: GPUBuffer;
	private readonly maskLogitsGpu: GPUBuffer;

	private constructor(
		readonly device: GPUDevice,
		private readonly dense: ort.InferenceSession,
		private readonly box: ort.InferenceSession,
		private readonly mask: ort.InferenceSession,
		readonly height: number,
		readonly width: number,
		readonly params: SegmentationParams,
		readonly boxChunk: number,
		readonly maskChunk: number,
		colors: 1 | 3
	) {
		this.input = new ImageInput(device, height, width, colors);
		const { paddedHeight, paddedWidth } = this.input;
		this.levelSizes = LEVELS.map((_, l) => [paddedHeight >> (l + 2), paddedWidth >> (l + 2)]);
		const cells = this.levelSizes.map(([h, w]) => h * w);
		this.anchors = this.levelSizes.map(([h, w], l) => levelAnchors(l, h, w));
		this.objectness = cells.map((n) => new Float32Array(ANCHORS_PER_CELL * n));
		const topCapacity = cells.reduce(
			(sum, n) => sum + Math.min(RPN_PARAMS.preNmsTopk, ANCHORS_PER_CELL * n),
			0
		);
		this.topDeltas = new Float32Array(4 * topCapacity);
		this.gather = new DeltaGather(device, cells, ANCHORS_PER_CELL, topCapacity);
		const pooledSizes = this.levelSizes.slice(0, POOLED_LEVELS);
		this.boxAlign = new RoiAlign(device, BOX_RESOLUTION, boxChunk, pooledSizes);
		this.maskAlign = new RoiAlign(device, MASK_RESOLUTION, maskChunk, pooledSizes);
		this.reader = new Reader(device, this.stats);
		const collected = (floats: number) =>
			device.createBuffer({
				size: 4 * floats,
				usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
			});
		this.boxScoresGpu = collected(this.boxScores.length);
		this.boxDeltasGpu = collected(this.boxDeltas.length);
		this.maskLogitsGpu = collected(this.maskLogits.length);
		this.imageTensor = ort.Tensor.fromGpuBuffer(this.input.image, {
			dataType: 'float32',
			dims: [1, 3, paddedHeight, paddedWidth]
		});
		this.boxTensor = ort.Tensor.fromGpuBuffer(this.boxAlign.pooled, {
			dataType: 'float32',
			dims: [boxChunk, 256, BOX_RESOLUTION, BOX_RESOLUTION]
		});
		this.maskTensor = ort.Tensor.fromGpuBuffer(this.maskAlign.pooled, {
			dataType: 'float32',
			dims: [maskChunk, 256, MASK_RESOLUTION, MASK_RESOLUTION]
		});
		this.detectionParams = {
			scoreThreshold: params.scoreThreshold,
			nmsThreshold: 0.5,
			topk: MAX_DETECTIONS
		};
	}

	/** Loads the three networks for frames of height x width; the kernels run on ONNX Runtime's device. */
	static async create(
		models: SegmentationModels,
		height: number,
		width: number,
		params: SegmentationParams,
		options: SegmenterOptions = {}
	): Promise<Segmenter> {
		const sessionOptions: ort.InferenceSession.SessionOptions = {
			// buffers released after each run: 446 MB at most instead of 474 with the default buckets, as fast
			executionProviders: [
				{ name: 'webgpu', storageBufferCacheMode: options.bufferCache ?? 'lazyRelease' }
			],
			graphOptimizationLevel: 'all',
			preferredOutputLocation: 'gpu-buffer'
		};
		// the frame size and the chunk sizes fix the networks' free dimensions, so that their shapes are static
		const boxChunk = options.boxChunk ?? 1000,
			maskChunk = options.maskChunk ?? 64;
		const padded = (n: number) => Math.ceil(n / SIZE_DIVISIBILITY) * SIZE_DIVISIBILITY;
		const fixed = options.fixedShapes ?? true;
		const create = (model: Uint8Array, dimensions: Record<string, number>) =>
			ort.InferenceSession.create(
				model,
				fixed ? { ...sessionOptions, freeDimensionOverrides: dimensions } : sessionOptions
			);
		const dense = await create(models.dense, { height: padded(height), width: padded(width) });
		const box = await create(models.box, { n: boxChunk });
		const mask = await create(models.mask, { m: maskChunk });
		const device = await ort.env.webgpu.device;
		return new Segmenter(
			device,
			dense,
			box,
			mask,
			height,
			width,
			params,
			boxChunk,
			maskChunk,
			options.colors ?? 1
		);
	}

	/** The records of frame `index` (height * width uint8 per color, row-major); `observe` receives the intermediate results. */
	async segment(
		frame: Uint8Array,
		index: number,
		observe?: (stages: FrameStages) => void
	): Promise<TrackType[]> {
		const { stats, height, width, reader } = this;
		let start = performance.now();
		const lap = (stage: keyof SegmenterStats['ms']) => {
			const now = performance.now();
			stats.ms[stage] += now - start;
			start = now;
		};
		const gpu = (tensor: ort.Tensor) => tensor.gpuBuffer as GPUBuffer;

		this.input.run(frame);
		const dense = await this.dense.run({ image: this.imageTensor });
		try {
			await reader.read(
				LEVELS.map((name, l) => ({
					buffer: gpu(dense[`objectness_${name}`]),
					floats: this.objectness[l].length,
					into: this.objectness[l]
				}))
			);
			lap('dense');
			const tops = this.objectness.map((objectness, l) =>
				topAnchors(
					objectness,
					this.levelSizes[l][0] * this.levelSizes[l][1],
					RPN_PARAMS.preNmsTopk
				)
			);
			lap('proposals');
			const total = this.gather.run(
				LEVELS.map((name) => gpu(dense[`deltas_${name}`])),
				tops
			);
			await reader.read([
				{ buffer: this.gather.gathered, floats: 4 * total, into: this.topDeltas }
			]);
			lap('gather');
			const proposals = proposalsFromTop(tops, this.topDeltas, this.anchors, height, width);
			lap('proposals');

			const features = LEVELS.slice(0, POOLED_LEVELS).map((name) => gpu(dense[name]));
			const boxScores = this.boxScores.subarray(0, 2 * proposals.count),
				boxDeltas = this.boxDeltas.subarray(0, 4 * proposals.count);
			const proposalLevels = assignLevels(proposals.boxes, proposals.count);
			for (let first = 0; first < proposals.count; first += this.boxChunk) {
				const n = Math.min(this.boxChunk, proposals.count - first);
				this.boxAlign.run(
					features,
					proposals.boxes.subarray(4 * first),
					proposalLevels.subarray(first),
					n
				);
				const out = await this.box.run({ pooled: this.boxTensor });
				this.collect([
					[gpu(out.scores), this.boxScoresGpu, 2 * first, 2 * n],
					[gpu(out.deltas), this.boxDeltasGpu, 4 * first, 4 * n]
				]);
				out.scores.dispose();
				out.deltas.dispose();
			}
			await reader.read([
				{ buffer: this.boxScoresGpu, floats: 2 * proposals.count, into: boxScores },
				{ buffer: this.boxDeltasGpu, floats: 4 * proposals.count, into: boxDeltas }
			]);
			lap('box');
			const detections = detectBoxes(
				proposals,
				boxScores,
				boxDeltas,
				height,
				width,
				this.detectionParams
			);
			lap('detections');

			const area = MASK_SIZE * MASK_SIZE;
			const maskLogits = this.maskLogits.subarray(0, area * detections.count);
			const detectionLevels = assignLevels(detections.boxes, detections.count);
			for (let first = 0; first < detections.count; first += this.maskChunk) {
				const n = Math.min(this.maskChunk, detections.count - first);
				this.maskAlign.run(
					features,
					detections.boxes.subarray(4 * first),
					detectionLevels.subarray(first),
					n
				);
				const out = await this.mask.run({ pooled: this.maskTensor });
				this.collect([[gpu(out.mask_logits), this.maskLogitsGpu, area * first, area * n]]);
				out.mask_logits.dispose();
			}
			await reader.read([
				{ buffer: this.maskLogitsGpu, floats: area * detections.count, into: maskLogits }
			]);
			lap('mask');
			const masks = nonemptyDetections(detections).map((d) =>
				pasteMask(maskLogits, d * area, MASK_SIZE, detections.boxes, d, height, width)
			);
			const records = maskRecords(index, masks, this.params.minObjectSize, height, width);
			lap('paste');
			stats.frames++;
			observe?.({
				objectness: this.objectness,
				tops,
				topDeltas: this.topDeltas,
				proposals,
				boxScores,
				boxDeltas,
				detections,
				maskLogits,
				masks
			});
			return records;
		} finally {
			for (const tensor of Object.values(dense)) tensor.dispose();
		}
	}

	/** Submits copies of [source, target, target offset, floats] (offsets and lengths in floats, sources from their start). */
	private collect(copies: readonly [GPUBuffer, GPUBuffer, number, number][]): void {
		const encoder = this.device.createCommandEncoder();
		for (const [source, target, at, floats] of copies)
			encoder.copyBufferToBuffer(source, 0, target, 4 * at, 4 * floats);
		this.device.queue.submit([encoder.finish()]);
	}

	async release(): Promise<void> {
		this.input.destroy();
		this.boxScoresGpu.destroy();
		this.boxDeltasGpu.destroy();
		this.maskLogitsGpu.destroy();
		this.gather.destroy();
		this.boxAlign.destroy();
		this.maskAlign.destroy();
		this.reader.destroy();
		await Promise.all([this.dense.release(), this.box.release(), this.mask.release()]);
	}
}
