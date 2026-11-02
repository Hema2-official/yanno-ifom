/**
 * The tracking model's local tracks on the GPU (DESIGN.md section 8.1, steps 3 to 5), as the experimental
 * copy's TrackingKernel computes them, with ONNX Runtime Web's WebGPU execution provider and the port's
 * kernels on its device:
 * - each frame is uploaded once, as uint8, into a ring of 2K + 2 slots;
 * - once per frame g, a kernel assembles the model's input: the 2K + 1 frames around g as
 *   float32(x / 255) (the central frame stands in beyond the ends of the video), zeros where the input
 *   is padded to multiples of 16, and the marker channel;
 * - per object, the 4 x 4 centroid marker is moved with Python's slicing (a centroid within two pixels
 *   of the top or left edge draws nothing, as in the reference), the model runs, and a kernel compares
 *   the logits with the float32 where torch.sigmoid(x) > confidence switches, which makes the comparison
 *   exact, and writes the channels bit-packed in column-major order (bits.ts);
 * - the bits are read back through two staging buffers in turn: the GPU runs the next object while the
 *   CPU turns this one's bits into runs.
 * The local tracks have the padded size, as the reference's.
 */
import * as ort from 'onnxruntime-web/webgpu';
import { sigmoidThreshold } from '../math/float32';
import type { TrackType } from '../output/records';
import { encodeBits } from '../rle/bits';
import { pack, type MultiRle } from '../rle/rle';
import { dispatchSize } from '../segment/input';
import { centroidMarker } from './marker';
import type { TrackedObject } from './objects';
import { trackRecordsAsync, type TrackingObservers, type TrackingStepParams } from './pipeline';
import { PlaneRing } from './ring';
import type { FrameSink, SymmetryTracker } from './tracker';

/** TrackingKernel pads the input to multiples of this. */
export const PAD_MULTIPLE = 16;

const ASSEMBLE_WGSL = /* wgsl */ `
struct Params {
  height: u32,
  width: u32,
  paddedHeight: u32,
  paddedWidth: u32,
  frameWords: u32,
  channels: u32,
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

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let plane = params.paddedHeight * params.paddedWidth;
  let i = id.y * params.groupsX * 256u + id.x;
  if (i >= params.channels * plane) {
    return;
  }
  let c = i / plane;
  let y = (i % plane) / params.paddedWidth;
  let x = i % params.paddedWidth;
  if (y >= params.height || x >= params.width) {
    input[i] = 0.0;
    return;
  }
  let q = y * params.width + x;
  let slot = params.slots[c / 4u][c % 4u];
  let byte = (ring[slot * params.frameWords + (q >> 2u)] >> ((q & 3u) * 8u)) & 255u;
  input[i] = pixelValues[byte / 4u][byte % 4u];
}
`;

const THRESHOLD_WGSL = /* wgsl */ `
struct Params {
  paddedHeight: u32,
  paddedWidth: u32,
  wordsPerChannel: u32,
  channels: u32,
  groupsX: u32,
  threshold: f32,
}

@group(0) @binding(0) var<storage, read> logits: array<f32>;
@group(0) @binding(1) var<storage, read_write> bits: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;

// one word: 32 pixels of a channel in column-major order, pixel p (= x * paddedHeight + y) as bit p % 32
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
    let x = p / params.paddedHeight;
    let y = p % params.paddedHeight;
    if (logits[(c * params.paddedHeight + y) * params.paddedWidth + x] >= params.threshold) {
      word |= 1u << b;
    }
  }
  bits[w] = word;
}
`;

export interface TrackingKernelOptions {
	/** ONNX Runtime's storageBufferCacheMode */
	readonly bufferCache?: 'disabled' | 'lazyRelease' | 'simple' | 'bucket';
	/** ONNX Runtime's graph capture: the model's GPU work recorded once and replayed for every object */
	readonly graphCapture?: boolean;
}

/** Objects, bytes read back, milliseconds in all and on the CPU (turning bits into runs), summed. */
export interface KernelStats {
	frames: number;
	objects: number;
	readBytes: number;
	ms: number;
	cpuMs: number;
}

/** What the tracking step needs of a kernel: the frames in a ring, and the local tracks of a frame's objects. */
export interface LocalTrackKernel {
	readonly timeKernelSize: number;
	uploadFrame(index: number, frame: Uint8Array): void;
	localTracks(g: number, centroids: readonly (readonly [number, number])[]): Promise<MultiRle[]>;
}

export class TrackingKernel implements LocalTrackKernel {
	readonly stats: KernelStats = { frames: 0, objects: 0, readBytes: 0, ms: 0, cpuMs: 0 };
	readonly paddedHeight: number;
	readonly paddedWidth: number;
	readonly frameChannels: number;
	private readonly wordsPerChannel: number;
	private readonly ring: PlaneRing;
	private readonly input: GPUBuffer;
	private readonly logits: GPUBuffer;
	private readonly bits: GPUBuffer;
	private readonly staging: GPUBuffer[];
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
	private readonly ones = new Float32Array(4).fill(1);
	private readonly zeros = new Float32Array(4);
	private marker: [number, number, number, number] = [0, 0, 0, 0];

	private constructor(
		readonly device: GPUDevice,
		private readonly session: ort.InferenceSession,
		readonly numFrames: number,
		readonly height: number,
		readonly width: number,
		readonly timeKernelSize: number,
		readonly threshold: number
	) {
		this.paddedHeight = Math.ceil(height / PAD_MULTIPLE) * PAD_MULTIPLE;
		this.paddedWidth = Math.ceil(width / PAD_MULTIPLE) * PAD_MULTIPLE;
		this.frameChannels = 2 * timeKernelSize + 1;
		const plane = this.paddedHeight * this.paddedWidth;
		this.wordsPerChannel = plane / 32;
		const usage = GPUBufferUsage;
		this.ring = new PlaneRing(device, 2 * timeKernelSize + 2, height * width);
		this.input = device.createBuffer({
			size: (this.frameChannels + 1) * plane * 4,
			usage: usage.STORAGE | usage.COPY_DST | usage.COPY_SRC
		});
		// the model writes its logits into a buffer of the port's, the same for every object
		this.logits = device.createBuffer({
			size: this.frameChannels * plane * 4,
			usage: usage.STORAGE | usage.COPY_SRC | usage.COPY_DST
		});
		const bitBytes = this.frameChannels * this.wordsPerChannel * 4;
		this.bits = device.createBuffer({ size: bitBytes, usage: usage.STORAGE | usage.COPY_SRC });
		this.staging = [0, 1].map(() =>
			device.createBuffer({ size: bitBytes, usage: usage.MAP_READ | usage.COPY_DST })
		);

		this.assembleGroups = dispatchSize(
			this.frameChannels * plane,
			device.limits.maxComputeWorkgroupsPerDimension
		);
		this.thresholdGroups = dispatchSize(
			this.frameChannels * this.wordsPerChannel,
			device.limits.maxComputeWorkgroupsPerDimension
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
			this.paddedHeight,
			this.paddedWidth,
			this.wordsPerChannel,
			this.frameChannels,
			this.thresholdGroups[0]
		]);
		new Float32Array(thresholdWords.buffer).set([threshold], 5);
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
				{ binding: 3, resource: { buffer: this.pixelValues } }
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
			dims: [1, this.frameChannels + 1, this.paddedHeight, this.paddedWidth]
		});
		this.logitsTensor = ort.Tensor.fromGpuBuffer(this.logits, {
			dataType: 'float32',
			dims: [1, this.frameChannels, this.paddedHeight, this.paddedWidth]
		});
	}

	/**
	 * Loads the tracking model (tools/export_models.py's track.onnx) for a video of numFrames frames of
	 * height x width, with time kernel size K and the segmentation confidence the masks must exceed.
	 */
	static async create(
		model: Uint8Array,
		numFrames: number,
		height: number,
		width: number,
		timeKernelSize: number,
		confidence: number,
		options: TrackingKernelOptions = {}
	): Promise<TrackingKernel> {
		const session = await ort.InferenceSession.create(model, {
			executionProviders: [
				{ name: 'webgpu', storageBufferCacheMode: options.bufferCache ?? 'lazyRelease' }
			],
			graphOptimizationLevel: 'all',
			// the video's size fixes the model's free dimensions, so that its shape computations fold away
			freeDimensionOverrides: {
				height: Math.ceil(height / PAD_MULTIPLE) * PAD_MULTIPLE,
				width: Math.ceil(width / PAD_MULTIPLE) * PAD_MULTIPLE
			},
			enableGraphCapture: options.graphCapture ?? false
		});
		const device = await ort.env.webgpu.device;
		return new TrackingKernel(
			device,
			session,
			numFrames,
			height,
			width,
			timeKernelSize,
			sigmoidThreshold(confidence)
		);
	}

	/** Uploads frame `index` (height * width uint8, row-major) into the ring, over the frame 2K + 2 before it. */
	uploadFrame(index: number, frame: Uint8Array): void {
		this.ring.write(index, frame);
	}

	/** Whether frame `index` is in the ring. */
	has(index: number): boolean {
		return this.ring.has(index);
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
		this.assemble(g);
		let pending: { index: number; staging: GPUBuffer; mapped: Promise<void> } | null = null;
		for (let i = 0; i < centroids.length; i++) {
			this.moveMarker(centroidMarker(centroids[i], this.height, this.width));
			await this.session.run({ input: this.inputTensor }, { logits: this.logitsTensor });
			const staging = this.staging[i % 2];
			const encoder = this.device.createCommandEncoder();
			const pass = encoder.beginComputePass();
			pass.setPipeline(this.thresholdPipeline);
			pass.setBindGroup(0, this.thresholdBindGroup);
			pass.dispatchWorkgroups(this.thresholdGroups[0], this.thresholdGroups[1]);
			pass.end();
			encoder.copyBufferToBuffer(this.bits, 0, staging, 0, this.bits.size);
			this.device.queue.submit([encoder.finish()]);
			const mapped = staging.mapAsync(GPUMapMode.READ);
			// the previous object's bits become runs while the GPU computes this one
			if (pending) tracks[pending.index] = await this.decode(pending.staging, pending.mapped);
			pending = { index: i, staging, mapped };
		}
		tracks[pending!.index] = await this.decode(pending!.staging, pending!.mapped);
		this.stats.frames++;
		this.stats.objects += centroids.length;
		this.stats.ms += performance.now() - start;
		return tracks;
	}

	/** Writes the frame channels of frame g into the input. */
	private assemble(g: number): void {
		const words = new Uint32Array(40);
		words.set([
			this.height,
			this.width,
			this.paddedHeight,
			this.paddedWidth,
			this.ring.planeWords,
			this.frameChannels,
			this.assembleGroups[0],
			0
		]);
		const k = this.timeKernelSize;
		for (let dt = -k; dt <= k; dt++)
			words[8 + dt + k] = this.ring.slot(g + dt >= 0 && g + dt < this.numFrames ? g + dt : g);
		this.device.queue.writeBuffer(this.assembleParams, 0, words);
		const encoder = this.device.createCommandEncoder();
		const pass = encoder.beginComputePass();
		pass.setPipeline(this.assemblePipeline);
		pass.setBindGroup(0, this.assembleBindGroup);
		pass.dispatchWorkgroups(this.assembleGroups[0], this.assembleGroups[1]);
		pass.end();
		this.device.queue.submit([encoder.finish()]);
	}

	/** Clears the marker of the previous object and draws [top, bottom, left, right) at 1. */
	private moveMarker(next: [number, number, number, number]): void {
		const channel = this.frameChannels * this.paddedHeight;
		const write = (
			rect: [number, number, number, number],
			values: Float32Array<ArrayBuffer>
		) => {
			const [top, bottom, left, right] = rect;
			for (let y = top; y < bottom; y++) {
				this.device.queue.writeBuffer(
					this.input,
					((channel + y) * this.paddedWidth + left) * 4,
					values,
					0,
					right - left
				);
			}
		};
		write(this.marker, this.zeros);
		write(next, this.ones);
		this.marker = next;
	}

	/** The runs of a staging buffer's channels, once it is mapped; unmaps it. */
	private async decode(staging: GPUBuffer, mapped: Promise<void>): Promise<MultiRle> {
		await mapped;
		const start = performance.now();
		const words = new Uint32Array(staging.getMappedRange());
		const channels: Uint32Array[] = [];
		for (let c = 0; c < this.frameChannels; c++) {
			channels.push(
				encodeBits(
					words,
					this.paddedHeight,
					this.paddedWidth,
					c * this.wordsPerChannel * 32
				)
			);
		}
		staging.unmap();
		this.stats.readBytes += staging.size;
		const track = pack(this.paddedHeight, this.paddedWidth, channels);
		this.stats.cpuMs += performance.now() - start;
		return track;
	}

	async release(): Promise<void> {
		this.ring.destroy();
		for (const buffer of [
			this.input,
			this.logits,
			this.bits,
			this.pixelValues,
			this.assembleParams,
			this.thresholdParams,
			...this.staging
		])
			buffer.destroy();
		await this.session.release();
	}
}

/** A video's prepared frames, as ChannelFrames gives them. */
export interface FrameReader {
	readonly count: number;
	readonly height: number;
	readonly width: number;
	frame(index: number, out?: Uint8Array): Promise<Uint8Array>;
}

/**
 * The tracking step on the GPU: trackRecordsAsync with the kernel's local tracks. The frames reach the
 * ring as the window moves, each once; frames that no window needs are not read. onTracks sees every
 * frame's local tracks.
 */
export async function trackVideo(
	frames: FrameReader,
	records: Iterable<TrackType>,
	params: TrackingStepParams,
	kernel: LocalTrackKernel,
	sink: FrameSink,
	observers: TrackingObservers = {},
	onTracks?: (
		frame: number,
		objects: readonly TrackedObject[],
		tracks: readonly MultiRle[]
	) => void
): Promise<SymmetryTracker> {
	if (kernel.timeKernelSize !== params.timeKernelSize)
		throw new Error(
			`the kernel's time kernel size is ${kernel.timeKernelSize}, the step's ${params.timeKernelSize}`
		);
	const buffer = new Uint8Array(frames.height * frames.width);
	const k = params.timeKernelSize;
	let next = 0;
	return trackRecordsAsync(
		records,
		frames.count,
		frames.height,
		frames.width,
		params,
		async (g, objects) => {
			for (next = Math.max(next, g - k); next <= Math.min(g + k, frames.count - 1); next++)
				kernel.uploadFrame(next, await frames.frame(next, buffer));
			const tracks = await kernel.localTracks(
				g,
				objects.map((o) => {
					if (!o.centroid) throw new Error(`${o.objectId} has no centroid to mark`);
					return o.centroid;
				})
			);
			onTracks?.(g, objects, tracks);
			return tracks;
		},
		sink,
		observers
	);
}
