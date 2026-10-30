/**
 * detectron2's ROIPooler (ROIAlignV2: torchvision's roi_align with aligned=True, sampling ratio 0) on the
 * GPU. Each box is assigned an FPN level on the CPU (assign_boxes_to_levels: canonical box 224 on p4, p2
 * to p5); the kernel reads that level's features, which the dense network left on the GPU, and writes
 * the pooled features straight into the head's input buffer, (n, 256, r, r) float32. One invocation per
 * output value: the bin's sample grid (ceil(roi size / r) per axis), each sample bilinear with
 * torchvision's border rules, averaged. It is not bit-exact with PyTorch: the heads' matrix products
 * round differently on the GPU anyway.
 */
import { dispatchSize } from './input';

const f = Math.fround;

/** The pooled FPN levels: p2 to p5, strides 4 to 32. */
export const POOLED_LEVELS = 4;

/**
 * assign_boxes_to_levels for the first n boxes, as level indices 0 to 3 (p2 to p5):
 * floor(4 + log2(sqrt(area) / 224 + 1e-8)), clamped, in float32.
 */
export function assignLevels(
	boxes: Float32Array,
	n: number,
	out: Uint32Array = new Uint32Array(n)
): Uint32Array {
	const epsilon = f(1e-8);
	for (let i = 0; i < n; i++) {
		const area = f(f(boxes[4 * i + 2] - boxes[4 * i]) * f(boxes[4 * i + 3] - boxes[4 * i + 1]));
		const level = Math.floor(f(4 + f(Math.log2(f(f(f(Math.sqrt(area)) / 224) + epsilon)))));
		out[i] = Math.min(Math.max(level, 2), 5) - 2;
	}
	return out;
}

const WGSL = /* wgsl */ `
struct Params {
  count: u32,
  resolution: u32,
  channels: u32,
  groupsX: u32,
  // height and width of each pooled level
  sizes: array<vec4<u32>, 4>,
}

@group(0) @binding(0) var<storage, read> p2: array<f32>;
@group(0) @binding(1) var<storage, read> p3: array<f32>;
@group(0) @binding(2) var<storage, read> p4: array<f32>;
@group(0) @binding(3) var<storage, read> p5: array<f32>;
@group(0) @binding(4) var<storage, read> boxes: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read> levels: array<u32>;
@group(0) @binding(6) var<storage, read_write> pooled: array<f32>;
@group(0) @binding(7) var<uniform> params: Params;

fn feature(level: u32, index: u32) -> f32 {
  switch level {
    case 0u: { return p2[index]; }
    case 1u: { return p3[index]; }
    case 2u: { return p4[index]; }
    default: { return p5[index]; }
  }
}

// torchvision's bilinear_interpolate: zero outside [-1, size], clamped to the last row and column
fn bilinear(level: u32, base: u32, height: i32, width: i32, yIn: f32, xIn: f32) -> f32 {
  if (yIn < -1.0 || yIn > f32(height) || xIn < -1.0 || xIn > f32(width)) {
    return 0.0;
  }
  var y = max(yIn, 0.0);
  var x = max(xIn, 0.0);
  var yLow = i32(y);
  var xLow = i32(x);
  var yHigh = yLow + 1;
  var xHigh = xLow + 1;
  if (yLow >= height - 1) {
    yLow = height - 1;
    yHigh = yLow;
    y = f32(yLow);
  }
  if (xLow >= width - 1) {
    xLow = width - 1;
    xHigh = xLow;
    x = f32(xLow);
  }
  let ly = y - f32(yLow);
  let lx = x - f32(xLow);
  let hy = 1.0 - ly;
  let hx = 1.0 - lx;
  let w = u32(width);
  return hy * hx * feature(level, base + u32(yLow) * w + u32(xLow))
       + hy * lx * feature(level, base + u32(yLow) * w + u32(xHigh))
       + ly * hx * feature(level, base + u32(yHigh) * w + u32(xLow))
       + ly * lx * feature(level, base + u32(yHigh) * w + u32(xHigh));
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let bins = params.resolution * params.resolution;
  let perBox = params.channels * bins;
  let index = id.y * params.groupsX * 256u + id.x;
  if (index >= params.count * perBox) {
    return;
  }
  let roi = index / perBox;
  let channel = (index % perBox) / bins;
  let bin = index % bins;
  let ph = f32(bin / params.resolution);
  let pw = f32(bin % params.resolution);
  let level = levels[roi];
  let box = boxes[roi];
  let height = i32(params.sizes[level].x);
  let width = i32(params.sizes[level].y);
  let scale = 1.0 / f32(4u << level);
  let startW = box.x * scale - 0.5;
  let startH = box.y * scale - 0.5;
  let roiW = box.z * scale - 0.5 - startW;
  let roiH = box.w * scale - 0.5 - startH;
  let r = f32(params.resolution);
  let binW = roiW / r;
  let binH = roiH / r;
  let gridW = u32(max(ceil(roiW / r), 0.0));
  let gridH = u32(max(ceil(roiH / r), 0.0));
  let base = channel * u32(height) * u32(width);
  var sum = 0.0;
  for (var iy = 0u; iy < gridH; iy++) {
    let y = startH + ph * binH + (f32(iy) + 0.5) * binH / f32(gridH);
    for (var ix = 0u; ix < gridW; ix++) {
      let x = startW + pw * binW + (f32(ix) + 0.5) * binW / f32(gridW);
      sum += bilinear(level, base, height, width, y, x);
    }
  }
  pooled[index] = sum / f32(max(gridW * gridH, 1u));
}
`;

export class RoiAlign {
	/** the pooled features of up to `capacity` boxes, (capacity, channels, resolution, resolution) float32 */
	readonly pooled: GPUBuffer;
	private readonly boxes: GPUBuffer;
	private readonly levels: GPUBuffer;
	private readonly params: GPUBuffer;
	private readonly pipeline: GPUComputePipeline;
	private readonly paramWords = new Uint32Array(20);

	/** levelSizes: [height, width] of p2 to p5. */
	constructor(
		private readonly device: GPUDevice,
		readonly resolution: number,
		readonly capacity: number,
		private readonly levelSizes: readonly (readonly [number, number])[],
		readonly channels = 256
	) {
		this.pooled = device.createBuffer({
			size: capacity * channels * resolution * resolution * 4,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
		});
		this.boxes = device.createBuffer({
			size: capacity * 16,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
		});
		this.levels = device.createBuffer({
			size: capacity * 4,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
		});
		this.params = device.createBuffer({
			size: this.paramWords.byteLength,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		this.pipeline = device.createComputePipeline({
			layout: 'auto',
			compute: { module: device.createShaderModule({ code: WGSL }), entryPoint: 'main' }
		});
	}

	/**
	 * Pools n boxes (boxes: 4n floats, levels: n level indices; n up to the capacity) from the levels'
	 * feature buffers (p2 to p5, (1, channels, height, width) float32) into `pooled`, and submits it.
	 * The rows from n on keep what they held.
	 */
	run(features: readonly GPUBuffer[], boxes: Float32Array, levels: Uint32Array, n: number): void {
		if (n === 0) return;
		const groups = dispatchSize(
			n * this.channels * this.resolution * this.resolution,
			this.device.limits.maxComputeWorkgroupsPerDimension
		);
		const words = this.paramWords;
		words.set([n, this.resolution, this.channels, groups[0]]);
		this.levelSizes.forEach(([height, width], l) =>
			words.set([height, width, 0, 0], 4 + 4 * l)
		);
		this.device.queue.writeBuffer(this.params, 0, words);
		this.device.queue.writeBuffer(this.boxes, 0, boxes, 0, 4 * n);
		this.device.queue.writeBuffer(this.levels, 0, levels, 0, n);
		const bindGroup = this.device.createBindGroup({
			layout: this.pipeline.getBindGroupLayout(0),
			entries: [
				...features.map((buffer, binding) => ({ binding, resource: { buffer } })),
				{ binding: 4, resource: { buffer: this.boxes } },
				{ binding: 5, resource: { buffer: this.levels } },
				{ binding: 6, resource: { buffer: this.pooled } },
				{ binding: 7, resource: { buffer: this.params } }
			]
		});
		const encoder = this.device.createCommandEncoder();
		const pass = encoder.beginComputePass();
		pass.setPipeline(this.pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.dispatchWorkgroups(groups[0], groups[1]);
		pass.end();
		this.device.queue.submit([encoder.finish()]);
	}

	destroy(): void {
		this.pooled.destroy();
		this.boxes.destroy();
		this.levels.destroy();
		this.params.destroy();
	}
}
