/**
 * The temporal pass on the GPU (ADOPTED_PIPELINE.md sections 2 and 6.3-6.8), with ONNX Runtime Web's
 * WebGPU execution provider and the port's kernels on its device. Each frame comes with the first pass's
 * objects, and the pass runs two frames behind them:
 * 1. the frame goes into a ring of five uint8 planes and its hint plane (hints.ts) into another;
 * 2. a kernel assembles the network's 13 channels for frame t: frames t-2 .. t+2 as float32(x / 255),
 *    frame t standing in beyond the ends of the video, then foreground and boundary of the hints of t-2,
 *    t-1, t+1, t+2, zeros beyond the ends;
 * 3. the network runs on the input already on the GPU;
 * 4. a kernel compares the logits with the float32 values where the sigmoid crosses the thresholds,
 *    which makes the comparisons exact, and reduces the maps to the mask and the seeds, bit-packed, and
 *    the distance logits. That is read back, 1.1 MB instead of the logits' 3.1 MB;
 * 5. the post-processing on the CPU (postprocess.ts) makes the objects, and they replace the first pass's.
 */
import * as ort from 'onnxruntime-web/webgpu';
import type { TrackType } from '../output/records';
import { dispatchSize } from '../segment/input';
import { PlaneRing } from '../track/ring';
import { HintBuilder } from './hints';
import { ABOVE_HALF, InstanceExtractor, NOT_BELOW_HALF, type InstanceParams } from './postprocess';
import { temporalRecords } from './records';

/** The frames on each side of frame t that the network sees. */
export const REACH = 2;
const SLOTS = 2 * REACH + 1;
const CHANNELS = SLOTS + 4 * REACH,
	MAPS = 3;
const NO_HINT = 0xffffffff;
/** The temporal network's ONNX model has this frame size fixed. */
export const FRAME_SIZE = 512;

const ASSEMBLE_WGSL = /* wgsl */ `
struct Params {
  height: u32,
  width: u32,
  planeWords: u32,
  groupsX: u32,
  // the ring slots of frames t-2 .. t+2, then of the hints of t-2, t-1, t+1, t+2
  slots: array<vec4<u32>, 3>,
}

@group(0) @binding(0) var<storage, read> frames: array<u32>;
@group(0) @binding(1) var<storage, read> hints: array<u32>;
@group(0) @binding(2) var<storage, read_write> input: array<f32>;
@group(0) @binding(3) var<uniform> params: Params;
// float32(float64(x) / 255) for every uint8 value x
@group(0) @binding(4) var<uniform> pixelValues: array<vec4<f32>, 64>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let plane = params.height * params.width;
  let i = id.y * params.groupsX * 256u + id.x;
  if (i >= ${CHANNELS}u * plane) {
    return;
  }
  let c = i / plane;
  let q = i % plane;
  let word = q >> 2u;
  let shift = (q & 3u) * 8u;
  if (c < ${SLOTS}u) {
    let slot = params.slots[c / 4u][c % 4u];
    let byte = (frames[slot * params.planeWords + word] >> shift) & 255u;
    input[i] = pixelValues[byte / 4u][byte % 4u];
    return;
  }
  let h = c - ${SLOTS}u;
  let entry = ${SLOTS}u + h / 2u;
  let slot = params.slots[entry / 4u][entry % 4u];
  if (slot == ${NO_HINT}u) {
    input[i] = 0.0;
    return;
  }
  let byte = (hints[slot * params.planeWords + word] >> shift) & 255u;
  input[i] = f32((byte >> (h & 1u)) & 1u);
}
`;

const REDUCE_WGSL = /* wgsl */ `
struct Params {
  height: u32,
  width: u32,
  distanceWords: u32,
  bitWords: u32,
  groupsX: u32,
  aboveHalf: f32,
  notBelowHalf: f32,
}

@group(0) @binding(0) var<storage, read> logits: array<f32>;
@group(0) @binding(1) var<storage, read_write> reduced: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;

// The result is three parts, every word written by one invocation:
// the distance logits with a margin, column-major (postprocess.ts, paddedIndex);
// the mask, column-major: pixel p = x * height + y is bit p % 32;
// the seeds, row-major: pixel q = y * width + x is bit q % 32.
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let plane = params.height * params.width;
  let w = id.y * params.groupsX * 256u + id.x;
  if (w < params.distanceWords) {
    let stride = params.height + 2u;
    let x = w / stride;
    let y = w % stride;
    if (x == 0u || y == 0u || x > params.width || y > params.height) {
      reduced[w] = 0u;
    } else {
      reduced[w] = bitcast<u32>(logits[2u * plane + (y - 1u) * params.width + (x - 1u)]);
    }
    return;
  }
  let m = w - params.distanceWords;
  if (m >= 2u * params.bitWords) {
    return;
  }
  var word = 0u;
  if (m < params.bitWords) {
    for (var b = 0u; b < 32u; b++) {
      let p = m * 32u + b;
      if (p < plane && logits[(p % params.height) * params.width + p / params.height] >= params.aboveHalf) {
        word |= 1u << b;
      }
    }
  } else {
    for (var b = 0u; b < 32u; b++) {
      let q = (m - params.bitWords) * 32u + b;
      if (q < plane && logits[q] >= params.aboveHalf && logits[2u * plane + q] >= params.aboveHalf && logits[plane + q] < params.notBelowHalf) {
        word |= 1u << b;
      }
    }
  }
  reduced[w] = word;
}
`;

export interface TemporalOptions {
	/** ONNX Runtime's storageBufferCacheMode */
	readonly bufferCache?: 'disabled' | 'lazyRelease' | 'simple' | 'bucket';
}

/** Bytes read back and milliseconds per stage, summed over the frames. */
export interface TemporalStats {
	frames: number;
	objects: number;
	readBytes: number;
	ms: Record<'hints' | 'network' | 'read' | 'post', number>;
}

/** A frame and the first pass's objects, in frame order. */
export interface FirstPassFrame {
	readonly index: number;
	readonly frame: Uint8Array;
	readonly records: readonly TrackType[];
}

export class TemporalSegmenter {
	readonly stats: TemporalStats = {
		frames: 0,
		objects: 0,
		readBytes: 0,
		ms: { hints: 0, network: 0, read: 0, post: 0 }
	};
	/** after each frame's network run, for diagnostics: receives the logits' buffer */
	onLogits: ((t: number, logits: GPUBuffer) => Promise<void>) | null = null;
	private readonly frames: PlaneRing;
	private readonly hints: PlaneRing;
	private readonly hintBuilder: HintBuilder;
	private readonly hintPlane: Uint8Array;
	private readonly extractor: InstanceExtractor;
	private readonly input: GPUBuffer;
	private readonly logits: GPUBuffer;
	private readonly reduced: GPUBuffer;
	private readonly staging: GPUBuffer;
	private readonly pixelValues: GPUBuffer;
	private readonly assembleParams: GPUBuffer;
	private readonly reduceParams: GPUBuffer;
	private readonly assemblePipeline: GPUComputePipeline;
	private readonly reducePipeline: GPUComputePipeline;
	private readonly assembleBindGroup: GPUBindGroup;
	private readonly reduceBindGroup: GPUBindGroup;
	private readonly inputTensor: ort.Tensor;
	private readonly logitsTensor: ort.Tensor;
	private readonly assembleGroups: [number, number];
	private readonly reduceGroups: [number, number];
	private readonly assembleWords = new Uint32Array(16);
	private readonly distance: Float32Array;
	private readonly mask: Uint32Array;
	private readonly seeds: Uint32Array;

	private constructor(
		readonly device: GPUDevice,
		private readonly session: ort.InferenceSession,
		readonly numFrames: number,
		readonly height: number,
		readonly width: number,
		params: InstanceParams
	) {
		const plane = height * width;
		const usage = GPUBufferUsage;
		this.frames = new PlaneRing(device, SLOTS, plane);
		this.hints = new PlaneRing(device, SLOTS, plane);
		this.hintBuilder = new HintBuilder(height, width);
		this.hintPlane = new Uint8Array(plane);
		this.extractor = new InstanceExtractor(height, width, params);
		this.input = device.createBuffer({
			size: CHANNELS * plane * 4,
			usage: usage.STORAGE | usage.COPY_DST | usage.COPY_SRC
		});
		// the network writes its logits into a buffer of the port's
		this.logits = device.createBuffer({
			size: MAPS * plane * 4,
			usage: usage.STORAGE | usage.COPY_SRC | usage.COPY_DST
		});
		const distanceWords = (height + 2) * (width + 2),
			bitWords = Math.ceil(plane / 32);
		const reducedWords = distanceWords + 2 * bitWords;
		this.reduced = device.createBuffer({
			size: reducedWords * 4,
			usage: usage.STORAGE | usage.COPY_SRC
		});
		this.staging = device.createBuffer({
			size: reducedWords * 4,
			usage: usage.MAP_READ | usage.COPY_DST
		});
		this.distance = new Float32Array(distanceWords);
		this.mask = new Uint32Array(bitWords);
		this.seeds = new Uint32Array(bitWords);

		const limit = device.limits.maxComputeWorkgroupsPerDimension;
		this.assembleGroups = dispatchSize(CHANNELS * plane, limit);
		this.reduceGroups = dispatchSize(reducedWords, limit);
		this.assembleParams = device.createBuffer({
			size: 64,
			usage: usage.UNIFORM | usage.COPY_DST
		});
		this.reduceParams = device.createBuffer({
			size: 32,
			usage: usage.UNIFORM | usage.COPY_DST
		});
		this.assembleWords.set([height, width, this.frames.planeWords, this.assembleGroups[0]]);
		const reduceWords = new Uint32Array(8);
		reduceWords.set([height, width, distanceWords, bitWords, this.reduceGroups[0]]);
		new Float32Array(reduceWords.buffer).set([ABOVE_HALF, NOT_BELOW_HALF], 5);
		device.queue.writeBuffer(this.reduceParams, 0, reduceWords);
		this.pixelValues = device.createBuffer({
			size: 1024,
			usage: usage.UNIFORM | usage.COPY_DST
		});
		device.queue.writeBuffer(
			this.pixelValues,
			0,
			Float32Array.from({ length: 256 }, (_, x) => x / 255)
		);

		const pipeline = (code: string) =>
			device.createComputePipeline({
				layout: 'auto',
				compute: { module: device.createShaderModule({ code }), entryPoint: 'main' }
			});
		this.assemblePipeline = pipeline(ASSEMBLE_WGSL);
		this.reducePipeline = pipeline(REDUCE_WGSL);
		this.assembleBindGroup = device.createBindGroup({
			layout: this.assemblePipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: this.frames.buffer } },
				{ binding: 1, resource: { buffer: this.hints.buffer } },
				{ binding: 2, resource: { buffer: this.input } },
				{ binding: 3, resource: { buffer: this.assembleParams } },
				{ binding: 4, resource: { buffer: this.pixelValues } }
			]
		});
		this.reduceBindGroup = device.createBindGroup({
			layout: this.reducePipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: this.logits } },
				{ binding: 1, resource: { buffer: this.reduced } },
				{ binding: 2, resource: { buffer: this.reduceParams } }
			]
		});
		this.inputTensor = ort.Tensor.fromGpuBuffer(this.input, {
			dataType: 'float32',
			dims: [1, CHANNELS, height, width]
		});
		this.logitsTensor = ort.Tensor.fromGpuBuffer(this.logits, {
			dataType: 'float32',
			dims: [1, MAPS, height, width]
		});
	}

	/** Loads the temporal network (models/temporal.onnx, its frame size fixed) for numFrames frames of height x width. */
	static async create(
		model: Uint8Array,
		numFrames: number,
		height: number,
		width: number,
		params: InstanceParams,
		options: TemporalOptions = {}
	): Promise<TemporalSegmenter> {
		if (height !== FRAME_SIZE || width !== FRAME_SIZE)
			throw new Error(
				`the temporal network takes ${FRAME_SIZE} x ${FRAME_SIZE} frames, not ${height} x ${width}`
			);
		const session = await ort.InferenceSession.create(model, {
			executionProviders: [
				{ name: 'webgpu', storageBufferCacheMode: options.bufferCache ?? 'lazyRelease' }
			],
			graphOptimizationLevel: 'all'
		});
		const device = await ort.env.webgpu.device;
		return new TemporalSegmenter(device, session, numFrames, height, width, params);
	}

	/**
	 * The second pass over the first pass's frames, which must arrive in order: yields [frame, records]
	 * for every frame, each as soon as the two frames after it have arrived.
	 */
	async *run(firstPass: AsyncIterable<FirstPassFrame>): AsyncGenerator<[number, TrackType[]]> {
		let last = -1;
		for await (const { index, frame, records } of firstPass) {
			this.addFrame(index, frame, records);
			last = index;
			if (index >= REACH) yield [index - REACH, await this.objects(index - REACH)];
		}
		for (let t = Math.max(0, last - REACH + 1); t <= last; t++)
			yield [t, await this.objects(t)];
	}

	/** Adds frame `index` (height * width uint8, row-major) and its objects to the rings. */
	addFrame(index: number, frame: Uint8Array, records: readonly TrackType[]): void {
		const start = performance.now();
		this.frames.write(index, frame);
		this.hintBuilder.build(records, this.hintPlane);
		this.hints.write(index, this.hintPlane);
		this.stats.ms.hints += performance.now() - start;
	}

	/** The records of frame t; frames t-2 .. t+2 that exist must be in the rings. */
	async objects(t: number): Promise<TrackType[]> {
		const { stats } = this;
		let start = performance.now();
		const lap = (stage: keyof TemporalStats['ms']) => {
			const now = performance.now();
			stats.ms[stage] += now - start;
			start = now;
		};
		this.setFrame(t);
		this.runPass(this.assemblePipeline, this.assembleBindGroup, this.assembleGroups);
		await this.session.run({ input: this.inputTensor }, { logits: this.logitsTensor });
		this.runPass(this.reducePipeline, this.reduceBindGroup, this.reduceGroups, (encoder) =>
			encoder.copyBufferToBuffer(this.reduced, 0, this.staging, 0, this.reduced.size)
		);
		lap('network');
		await this.staging.mapAsync(GPUMapMode.READ);
		const mapped = this.staging.getMappedRange();
		const distanceBytes = this.distance.byteLength,
			bitBytes = this.mask.byteLength;
		this.distance.set(new Float32Array(mapped, 0, this.distance.length));
		this.mask.set(new Uint32Array(mapped, distanceBytes, this.mask.length));
		this.seeds.set(new Uint32Array(mapped, distanceBytes + bitBytes, this.seeds.length));
		this.staging.unmap();
		stats.readBytes += this.staging.size;
		lap('read');
		if (this.onLogits) {
			await this.onLogits(t, this.logits);
			start = performance.now();
		}
		const objects = this.extractor.objects({
			distance: this.distance,
			mask: this.mask,
			seeds: this.seeds
		});
		const records = temporalRecords(t, objects, this.height, this.width);
		lap('post');
		stats.frames++;
		stats.objects += records.length;
		return records;
	}

	/** Writes the ring slots of frame t's channels. */
	private setFrame(t: number): void {
		const words = this.assembleWords;
		for (let d = -REACH; d <= REACH; d++) {
			const frame = t + d;
			const inside = frame >= 0 && frame < this.numFrames;
			words[4 + d + REACH] = this.frames.slot(inside ? frame : t);
			if (d !== 0)
				words[4 + SLOTS + (d < 0 ? d + REACH : d + REACH - 1)] = inside
					? this.hints.slot(frame)
					: NO_HINT;
		}
		this.device.queue.writeBuffer(this.assembleParams, 0, words);
	}

	private runPass(
		pipeline: GPUComputePipeline,
		bindGroup: GPUBindGroup,
		groups: [number, number],
		after?: (encoder: GPUCommandEncoder) => void
	): void {
		const encoder = this.device.createCommandEncoder();
		const pass = encoder.beginComputePass();
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.dispatchWorkgroups(groups[0], groups[1]);
		pass.end();
		after?.(encoder);
		this.device.queue.submit([encoder.finish()]);
	}

	async release(): Promise<void> {
		this.frames.destroy();
		this.hints.destroy();
		for (const buffer of [
			this.input,
			this.logits,
			this.reduced,
			this.staging,
			this.pixelValues,
			this.assembleParams,
			this.reduceParams
		])
			buffer.destroy();
		await this.session.release();
	}
}
