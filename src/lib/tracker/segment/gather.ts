/**
 * The RPN deltas of the top anchors, gathered on the GPU from the dense network's outputs, so that only
 * they are read back: four floats per top anchor (at most 4000 per level) instead of whole maps (1 MB
 * per 512 x 512 frame). The levels' deltas are (A, 4, height, width) float32, the RPN head's layout.
 */
import { dispatchSize } from './input';
import type { TopAnchors } from './proposals';

/** The RPN's levels, p2 to p6. */
const LEVEL_COUNT = 5;

const WGSL = /* wgsl */ `
struct Params {
  total: u32,
  anchorsPerCell: u32,
  groupsX: u32,
  unused: u32,
  // the first gathered anchor of each level, and the end
  starts: array<vec4<u32>, 2>,
  cells: array<vec4<u32>, 2>,
}

@group(0) @binding(0) var<storage, read> d2: array<f32>;
@group(0) @binding(1) var<storage, read> d3: array<f32>;
@group(0) @binding(2) var<storage, read> d4: array<f32>;
@group(0) @binding(3) var<storage, read> d5: array<f32>;
@group(0) @binding(4) var<storage, read> d6: array<f32>;
@group(0) @binding(5) var<storage, read> anchors: array<u32>;
@group(0) @binding(6) var<storage, read_write> gathered: array<f32>;
@group(0) @binding(7) var<uniform> params: Params;

fn delta(level: u32, index: u32) -> f32 {
  switch level {
    case 0u: { return d2[index]; }
    case 1u: { return d3[index]; }
    case 2u: { return d4[index]; }
    case 3u: { return d5[index]; }
    default: { return d6[index]; }
  }
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let j = id.y * params.groupsX * 256u + id.x;
  if (j >= params.total) {
    return;
  }
  var level = 0u;
  for (var l = 1u; l < 5u; l++) {
    if (j >= params.starts[l / 4u][l % 4u]) {
      level = l;
    }
  }
  let cells = params.cells[level / 4u][level % 4u];
  let i = anchors[j];
  let cell = i / params.anchorsPerCell;
  let a = i % params.anchorsPerCell;
  for (var c = 0u; c < 4u; c++) {
    gathered[4u * j + c] = delta(level, (a * 4u + c) * cells + cell);
  }
}
`;

export class DeltaGather {
	/** four deltas per top anchor, the levels one after the other */
	readonly gathered: GPUBuffer;
	private readonly anchors: GPUBuffer;
	private readonly params: GPUBuffer;
	private readonly pipeline: GPUComputePipeline;
	private readonly indices: Uint32Array<ArrayBuffer>;

	/** cells: height * width of each level; capacity: the most top anchors of all levels together. */
	constructor(
		private readonly device: GPUDevice,
		private readonly cells: readonly number[],
		private readonly anchorsPerCell: number,
		readonly capacity: number
	) {
		this.indices = new Uint32Array(capacity);
		this.anchors = device.createBuffer({
			size: capacity * 4,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
		});
		this.gathered = device.createBuffer({
			size: capacity * 16,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
		});
		this.params = device.createBuffer({
			size: 80,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		this.pipeline = device.createComputePipeline({
			layout: 'auto',
			compute: { module: device.createShaderModule({ code: WGSL }), entryPoint: 'main' }
		});
	}

	/** Gathers the deltas of the top anchors of each level (tops) from the levels' delta buffers, and submits it. */
	run(deltas: readonly GPUBuffer[], tops: readonly TopAnchors[]): number {
		const starts = new Uint32Array(8),
			cells = new Uint32Array(8);
		let total = 0;
		tops.forEach((top, l) => {
			starts[l] = total;
			cells[l] = this.cells[l];
			this.indices.set(top.anchors, total);
			total += top.anchors.length;
		});
		starts[LEVEL_COUNT] = total;
		if (total === 0) return 0;
		const groups = dispatchSize(total, this.device.limits.maxComputeWorkgroupsPerDimension);
		const words = new Uint32Array(20);
		words.set([total, this.anchorsPerCell, groups[0], 0]);
		words.set(starts, 4);
		words.set(cells, 12);
		this.device.queue.writeBuffer(this.params, 0, words);
		this.device.queue.writeBuffer(this.anchors, 0, this.indices, 0, total);
		const bindGroup = this.device.createBindGroup({
			layout: this.pipeline.getBindGroupLayout(0),
			entries: [
				...deltas.map((buffer, binding) => ({ binding, resource: { buffer } })),
				{ binding: 5, resource: { buffer: this.anchors } },
				{ binding: 6, resource: { buffer: this.gathered } },
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
		return total;
	}

	destroy(): void {
		this.anchors.destroy();
		this.gathered.destroy();
		this.params.destroy();
	}
}
