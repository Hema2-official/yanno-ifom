/**
 * The segmentation network's input on the GPU: the uint8 frame is uploaded as it is, and a kernel writes
 * detectron2's normalized image, (1, 3, H', W') float32: the gray value minus each of the three BGR
 * means (PIXEL_MEAN; PIXEL_STD is 1), as GeneralizedRCNN.preprocess_image broadcasts the one channel,
 * and zeros where ImageList pads to multiples of 32. One float32 subtraction per value, so it is exact.
 * An RGB frame's red, green and blue take the three means in that order: the backend's RGB mode hands
 * the predictor RGB images, which it takes for BGR ones, as the model's INPUT.FORMAT says.
 */

/** detectron2's FPN pads the image to multiples of this. */
export const SIZE_DIVISIBILITY = 32;

const WGSL = /* wgsl */ `
struct Params {
  height: u32,
  width: u32,
  paddedHeight: u32,
  paddedWidth: u32,
  groupsX: u32,
  colors: u32,
}

@group(0) @binding(0) var<storage, read> frame: array<u32>;
@group(0) @binding(1) var<storage, read_write> image: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

fn byteAt(k: u32) -> f32 {
  return f32((frame[k >> 2u] >> ((k & 3u) * 8u)) & 255u);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let plane = params.paddedHeight * params.paddedWidth;
  let i = id.y * params.groupsX * 256u + id.x;
  if (i >= plane) {
    return;
  }
  let y = i / params.paddedWidth;
  let x = i % params.paddedWidth;
  if (y >= params.height || x >= params.width) {
    image[i] = 0.0;
    image[plane + i] = 0.0;
    image[2u * plane + i] = 0.0;
    return;
  }
  let p = (y * params.width + x) * params.colors;
  // the gray value three times, or the pixel's three colors
  let step = params.colors / 3u;
  image[i] = byteAt(p) - 103.53;
  image[plane + i] = byteAt(p + step) - 116.28;
  image[2u * plane + i] = byteAt(p + 2u * step) - 123.675;
}
`;

/** Workgroups for n invocations of a 256-wide kernel, as (x, y) within the per-dimension limit. */
export function dispatchSize(n: number, limit = 65535): [number, number] {
	const groups = Math.ceil(n / 256);
	const x = Math.min(groups, limit);
	return [x, Math.ceil(groups / x)];
}

export class ImageInput {
	readonly paddedHeight: number;
	readonly paddedWidth: number;
	/** the normalized image, (1, 3, paddedHeight, paddedWidth) float32 */
	readonly image: GPUBuffer;
	private readonly frame: GPUBuffer;
	private readonly staging: Uint8Array;
	private readonly params: GPUBuffer;
	private readonly pipeline: GPUComputePipeline;
	private readonly bindGroup: GPUBindGroup;
	private readonly groups: [number, number];

	/** `colors` is 1 for gray frames, 3 for RGB ones */
	constructor(
		private readonly device: GPUDevice,
		readonly height: number,
		readonly width: number,
		readonly colors: 1 | 3 = 1
	) {
		this.paddedHeight = Math.ceil(height / SIZE_DIVISIBILITY) * SIZE_DIVISIBILITY;
		this.paddedWidth = Math.ceil(width / SIZE_DIVISIBILITY) * SIZE_DIVISIBILITY;
		const plane = this.paddedHeight * this.paddedWidth;
		this.staging = new Uint8Array(Math.ceil((height * width * colors) / 4) * 4);
		this.frame = device.createBuffer({
			size: this.staging.length,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
		});
		this.image = device.createBuffer({
			size: 3 * plane * 4,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
		});
		this.groups = dispatchSize(plane, device.limits.maxComputeWorkgroupsPerDimension);
		this.params = device.createBuffer({
			size: 32,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		device.queue.writeBuffer(
			this.params,
			0,
			new Uint32Array([
				height,
				width,
				this.paddedHeight,
				this.paddedWidth,
				this.groups[0],
				colors,
				0,
				0
			])
		);
		this.pipeline = device.createComputePipeline({
			layout: 'auto',
			compute: { module: device.createShaderModule({ code: WGSL }), entryPoint: 'main' }
		});
		this.bindGroup = device.createBindGroup({
			layout: this.pipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: this.frame } },
				{ binding: 1, resource: { buffer: this.image } },
				{ binding: 2, resource: { buffer: this.params } }
			]
		});
	}

	/** Uploads a frame (height * width * colors uint8, row-major) and submits the kernel that writes the image. */
	run(frame: Uint8Array): void {
		this.staging.set(frame);
		this.device.queue.writeBuffer(this.frame, 0, this.staging);
		const encoder = this.device.createCommandEncoder();
		const pass = encoder.beginComputePass();
		pass.setPipeline(this.pipeline);
		pass.setBindGroup(0, this.bindGroup);
		pass.dispatchWorkgroups(this.groups[0], this.groups[1]);
		pass.end();
		this.device.queue.submit([encoder.finish()]);
	}

	destroy(): void {
		this.frame.destroy();
		this.image.destroy();
		this.params.destroy();
	}
}
