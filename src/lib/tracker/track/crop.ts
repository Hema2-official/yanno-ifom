/**
 * The crop tracker's local tracks on the GPU (ADOPTED_PIPELINE.md section 6.10), as CropKernel in
 * training/track_crop.py computes them, with ONNX Runtime Web's WebGPU execution provider and the
 * port's kernels on its device:
 * - each frame is uploaded once, as uint8, into a ring of 2K + 2 slots;
 * - the objects of a frame run in chunks of the same size, the last one's spare rows computed but not
 *   read. A kernel cuts each object's S x S window around its centroid out of the 2K + 1 frames around g
 *   as float32(x / 255) (the central frame stands in beyond the ends of the video, pixels beyond the frame
 *   are 0) and draws the marker on the central 4 x 4 pixels;
 * - a kernel compares the logits with the float32 where torch.sigmoid(x) > confidence switches and
 *   writes every window's channels bit-packed in column-major order (bits.ts);
 * - a chunk's bits are read through two staging buffers in turn: the GPU runs the next chunk while the
 *   CPU turns this one's bits into runs and pastes them into frame coordinates.
 * The local tracks have the frame's padded size, as with the whole-frame kernel.
 */
import * as ort from 'onnxruntime-web/webgpu';
import { sigmoidThreshold } from '../math/float32';
import { encodeBits } from '../rle/bits';
import { pack, pasteRuns, type MultiRle } from '../rle/rle';
import { dispatchSize } from '../segment/input';
import { PAD_MULTIPLE, type KernelStats, type LocalTrackKernel } from './kernel';
import { PlaneRing } from './ring';

/** The crop tracker's window, in pixels; its ONNX model has this fixed. */
export const WINDOW = 128;

const ASSEMBLE_WGSL = /* wgsl */ `
struct Params {
  height: u32,
  width: u32,
  frameWords: u32,
  window: u32,
  frameChannels: u32,
  windows: u32,
  groupsX: u32,
  unused: u32,
  // the ring slot of each frame channel
  slots: array<vec4<u32>, 8>,
}

@group(0) @binding(0) var<storage, read> ring: array<u32>;
@group(0) @binding(1) var<storage, read_write> input: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;
// float32(float64(x) / 255) for every uint8 value x
@group(0) @binding(3) var<uniform> pixelValues: array<vec4<f32>, 64>;
// each window's top row and left column in the frame
@group(0) @binding(4) var<storage, read> corners: array<vec2<i32>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let plane = params.window * params.window;
  let perWindow = (params.frameChannels + 1u) * plane;
  let i = id.y * params.groupsX * 256u + id.x;
  if (i >= params.windows * perWindow) {
    return;
  }
  let n = i / perWindow;
  let c = (i % perWindow) / plane;
  let y = (i % plane) / params.window;
  let x = i % params.window;
  if (c == params.frameChannels) {
    let low = params.window / 2u - 2u;
    let onMarker = y >= low && y < low + 4u && x >= low && x < low + 4u;
    input[i] = select(0.0, 1.0, onMarker);
    return;
  }
  let frameY = corners[n].x + i32(y);
  let frameX = corners[n].y + i32(x);
  if (frameY < 0 || frameX < 0 || frameY >= i32(params.height) || frameX >= i32(params.width)) {
    input[i] = 0.0;
    return;
  }
  let q = u32(frameY) * params.width + u32(frameX);
  let slot = params.slots[c / 4u][c % 4u];
  let byte = (ring[slot * params.frameWords + (q >> 2u)] >> ((q & 3u) * 8u)) & 255u;
  input[i] = pixelValues[byte / 4u][byte % 4u];
}
`;

const THRESHOLD_WGSL = /* wgsl */ `
struct Params {
  window: u32,
  wordsPerChannel: u32,
  channels: u32,
  groupsX: u32,
  threshold: f32,
}

@group(0) @binding(0) var<storage, read> logits: array<f32>;
@group(0) @binding(1) var<storage, read_write> bits: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;

// one word: 32 pixels of a channel in column-major order, pixel p (= x * window + y) as bit p % 32
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let w = id.y * params.groupsX * 256u + id.x;
  if (w >= params.channels * params.wordsPerChannel) {
    return;
  }
  let c = w / params.wordsPerChannel;
  let first = (w % params.wordsPerChannel) * 32u;
  var word = 0u;
  for (var b = 0u; b < 32u; b++) {
    let p = first + b;
    let x = p / params.window;
    let y = p % params.window;
    if (logits[(c * params.window + y) * params.window + x] >= params.threshold) {
      word |= 1u << b;
    }
  }
  bits[w] = word;
}
`;

export interface CropKernelOptions {
	/** windows per network run */
	readonly chunk?: number;
	/** ONNX Runtime's storageBufferCacheMode */
	readonly bufferCache?: 'disabled' | 'lazyRelease' | 'simple' | 'bucket';
}

export class CropTrackingKernel implements LocalTrackKernel {
	readonly stats: KernelStats = { frames: 0, objects: 0, readBytes: 0, ms: 0, cpuMs: 0 };
	readonly paddedHeight: number;
	readonly paddedWidth: number;
	readonly frameChannels: number;
	readonly chunk: number;
	private readonly wordsPerChannel = (WINDOW * WINDOW) / 32;
	private readonly ring: PlaneRing;
	private readonly input: GPUBuffer;
	private readonly logits: GPUBuffer;
	private readonly bits: GPUBuffer;
	private readonly staging: GPUBuffer[];
	private readonly corners: GPUBuffer;
	private readonly pixelValues: GPUBuffer;
	private readonly assembleParams: GPUBuffer;
	private readonly thresholdParams: GPUBuffer;
	private readonly assemblePipeline: GPUComputePipeline;
	private readonly thresholdPipeline: GPUComputePipeline;
	private readonly assembleBindGroup: GPUBindGroup;
	private readonly thresholdBindGroup: GPUBindGroup;
	private readonly inputTensor: ort.Tensor;
	private readonly logitsTensor: ort.Tensor;
	private readonly assembleGroups: [number, number];
	private readonly thresholdGroups: [number, number];
	private readonly assembleWords = new Uint32Array(40);
	private readonly cornerValues: Int32Array<ArrayBuffer>;

	private constructor(
		readonly device: GPUDevice,
		private readonly session: ort.InferenceSession,
		readonly numFrames: number,
		readonly height: number,
		readonly width: number,
		readonly timeKernelSize: number,
		threshold: number,
		chunk: number
	) {
		this.chunk = chunk;
		this.paddedHeight = Math.ceil(height / PAD_MULTIPLE) * PAD_MULTIPLE;
		this.paddedWidth = Math.ceil(width / PAD_MULTIPLE) * PAD_MULTIPLE;
		this.frameChannels = 2 * timeKernelSize + 1;
		const plane = WINDOW * WINDOW;
		const usage = GPUBufferUsage;
		this.ring = new PlaneRing(device, 2 * timeKernelSize + 2, height * width);
		this.input = device.createBuffer({
			size: chunk * (this.frameChannels + 1) * plane * 4,
			usage: usage.STORAGE | usage.COPY_DST | usage.COPY_SRC
		});
		// the model writes its logits into a buffer of the port's, the same for every chunk
		this.logits = device.createBuffer({
			size: chunk * this.frameChannels * plane * 4,
			usage: usage.STORAGE | usage.COPY_SRC | usage.COPY_DST
		});
		const bitBytes = chunk * this.frameChannels * this.wordsPerChannel * 4;
		this.bits = device.createBuffer({ size: bitBytes, usage: usage.STORAGE | usage.COPY_SRC });
		this.staging = [0, 1].map(() =>
			device.createBuffer({ size: bitBytes, usage: usage.MAP_READ | usage.COPY_DST })
		);
		this.cornerValues = new Int32Array(2 * chunk);
		this.corners = device.createBuffer({
			size: 8 * chunk,
			usage: usage.STORAGE | usage.COPY_DST
		});

		const limit = device.limits.maxComputeWorkgroupsPerDimension;
		this.assembleGroups = dispatchSize(chunk * (this.frameChannels + 1) * plane, limit);
		this.thresholdGroups = dispatchSize(
			chunk * this.frameChannels * this.wordsPerChannel,
			limit
		);
		this.assembleParams = device.createBuffer({
			size: 160,
			usage: usage.UNIFORM | usage.COPY_DST
		});
		this.thresholdParams = device.createBuffer({
			size: 32,
			usage: usage.UNIFORM | usage.COPY_DST
		});
		const thresholdWords = new Uint32Array(8);
		thresholdWords.set([
			WINDOW,
			this.wordsPerChannel,
			chunk * this.frameChannels,
			this.thresholdGroups[0]
		]);
		new Float32Array(thresholdWords.buffer).set([threshold], 4);
		device.queue.writeBuffer(this.thresholdParams, 0, thresholdWords);
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
		this.thresholdPipeline = pipeline(THRESHOLD_WGSL);
		this.assembleBindGroup = device.createBindGroup({
			layout: this.assemblePipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: this.ring.buffer } },
				{ binding: 1, resource: { buffer: this.input } },
				{ binding: 2, resource: { buffer: this.assembleParams } },
				{ binding: 3, resource: { buffer: this.pixelValues } },
				{ binding: 4, resource: { buffer: this.corners } }
			]
		});
		this.thresholdBindGroup = device.createBindGroup({
			layout: this.thresholdPipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: this.logits } },
				{ binding: 1, resource: { buffer: this.bits } },
				{ binding: 2, resource: { buffer: this.thresholdParams } }
			]
		});
		this.inputTensor = ort.Tensor.fromGpuBuffer(this.input, {
			dataType: 'float32',
			dims: [chunk, this.frameChannels + 1, WINDOW, WINDOW]
		});
		this.logitsTensor = ort.Tensor.fromGpuBuffer(this.logits, {
			dataType: 'float32',
			dims: [chunk, this.frameChannels, WINDOW, WINDOW]
		});
		this.assembleWords.set([
			height,
			width,
			this.ring.planeWords,
			WINDOW,
			this.frameChannels,
			chunk,
			this.assembleGroups[0],
			0
		]);
	}

	/**
	 * Loads the crop tracker (models/crop_tracker.onnx) for a video of numFrames frames of height x width,
	 * with time kernel size K and the segmentation confidence the masks must exceed.
	 */
	static async create(
		model: Uint8Array,
		numFrames: number,
		height: number,
		width: number,
		timeKernelSize: number,
		confidence: number,
		options: CropKernelOptions = {}
	): Promise<CropTrackingKernel> {
		const chunk = options.chunk ?? 4;
		const session = await ort.InferenceSession.create(model, {
			executionProviders: [
				{ name: 'webgpu', storageBufferCacheMode: options.bufferCache ?? 'lazyRelease' }
			],
			graphOptimizationLevel: 'all',
			freeDimensionOverrides: { batch: chunk }
		});
		const device = await ort.env.webgpu.device;
		return new CropTrackingKernel(
			device,
			session,
			numFrames,
			height,
			width,
			timeKernelSize,
			sigmoidThreshold(confidence),
			chunk
		);
	}

	/** Uploads frame `index` (height * width uint8, row-major) into the ring. */
	uploadFrame(index: number, frame: Uint8Array): void {
		this.ring.write(index, frame);
	}

	/**
	 * The local tracks of the objects of frame g with the given centroids ([x, y], as CenterMass gives
	 * them), each as 2K + 1 packed channels of the padded size. The frames g - K .. g + K that exist must
	 * be in the ring.
	 */
	async localTracks(
		g: number,
		centroids: readonly (readonly [number, number])[]
	): Promise<MultiRle[]> {
		const start = performance.now();
		const tracks: MultiRle[] = new Array(centroids.length);
		if (centroids.length === 0) return tracks;
		this.setFrame(g);
		const half = WINDOW >> 1;
		let pending: {
			first: number;
			count: number;
			staging: GPUBuffer;
			mapped: Promise<void>;
		} | null = null;
		for (let first = 0, k = 0; first < centroids.length; first += this.chunk, k++) {
			const count = Math.min(this.chunk, centroids.length - first);
			for (let i = 0; i < count; i++) {
				const [cx, cy] = centroids[first + i];
				this.cornerValues[2 * i] = cy - half;
				this.cornerValues[2 * i + 1] = cx - half;
			}
			this.device.queue.writeBuffer(this.corners, 0, this.cornerValues);
			this.runPass(this.assemblePipeline, this.assembleBindGroup, this.assembleGroups);
			await this.session.run({ input: this.inputTensor }, { logits: this.logitsTensor });
			const staging = this.staging[k % 2];
			const bytes = count * this.frameChannels * this.wordsPerChannel * 4;
			this.runPass(
				this.thresholdPipeline,
				this.thresholdBindGroup,
				this.thresholdGroups,
				(encoder) => encoder.copyBufferToBuffer(this.bits, 0, staging, 0, bytes)
			);
			const mapped = staging.mapAsync(GPUMapMode.READ, 0, bytes);
			// the previous chunk's bits become runs while the GPU computes this one
			if (pending)
				await this.decode(
					pending.first,
					pending.count,
					centroids,
					pending.staging,
					pending.mapped,
					tracks
				);
			pending = { first, count, staging, mapped };
		}
		await this.decode(
			pending!.first,
			pending!.count,
			centroids,
			pending!.staging,
			pending!.mapped,
			tracks
		);
		this.stats.frames++;
		this.stats.objects += centroids.length;
		this.stats.ms += performance.now() - start;
		return tracks;
	}

	/** Writes the ring slots of the frame channels of frame g. */
	private setFrame(g: number): void {
		const k = this.timeKernelSize;
		for (let dt = -k; dt <= k; dt++) {
			this.assembleWords[8 + dt + k] = this.ring.slot(
				g + dt >= 0 && g + dt < this.numFrames ? g + dt : g
			);
		}
		this.device.queue.writeBuffer(this.assembleParams, 0, this.assembleWords);
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

	/** The local tracks of a chunk, once its staging buffer is mapped; unmaps it. */
	private async decode(
		first: number,
		count: number,
		centroids: readonly (readonly [number, number])[],
		staging: GPUBuffer,
		mapped: Promise<void>,
		tracks: MultiRle[]
	): Promise<void> {
		await mapped;
		const start = performance.now();
		const words = new Uint32Array(
			staging.getMappedRange(0, count * this.frameChannels * this.wordsPerChannel * 4)
		);
		const half = WINDOW >> 1;
		for (let i = 0; i < count; i++) {
			const [cx, cy] = centroids[first + i];
			const channels: Uint32Array[] = [];
			for (let c = 0; c < this.frameChannels; c++) {
				const runs = encodeBits(
					words,
					WINDOW,
					WINDOW,
					(i * this.frameChannels + c) * this.wordsPerChannel * 32
				);
				channels.push(
					pasteRuns(
						runs,
						WINDOW,
						this.paddedHeight,
						this.paddedWidth,
						cy - half,
						cx - half,
						this.height,
						this.width
					)
				);
			}
			tracks[first + i] = pack(this.paddedHeight, this.paddedWidth, channels);
		}
		staging.unmap();
		this.stats.readBytes += count * this.frameChannels * this.wordsPerChannel * 4;
		this.stats.cpuMs += performance.now() - start;
	}

	async release(): Promise<void> {
		this.ring.destroy();
		for (const buffer of [
			this.input,
			this.logits,
			this.bits,
			this.corners,
			this.pixelValues,
			this.assembleParams,
			this.thresholdParams,
			...this.staging
		])
			buffer.destroy();
		await this.session.release();
	}
}
