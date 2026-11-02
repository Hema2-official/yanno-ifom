/**
 * A ring of byte planes on the GPU, such as the uint8 frames around the frame being processed: plane
 * `index` goes into slot index % slots, over the plane that many before it, and is written once.
 */
export class PlaneRing {
	readonly buffer: GPUBuffer;
	/** the u32 words of a slot; its bytes are the plane's, row-major, low byte first */
	readonly planeWords: number;
	private readonly staging: Uint8Array<ArrayBuffer>;
	private readonly uploaded = new Map<number, number>();

	constructor(
		private readonly device: GPUDevice,
		readonly slots: number,
		planeBytes: number
	) {
		this.planeWords = Math.ceil(planeBytes / 4);
		this.staging = new Uint8Array(4 * this.planeWords);
		this.buffer = device.createBuffer({
			size: slots * this.planeWords * 4,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
		});
	}

	write(index: number, plane: Uint8Array): void {
		const slot = index % this.slots;
		for (const [other, s] of this.uploaded) if (s === slot) this.uploaded.delete(other);
		this.staging.set(plane);
		this.device.queue.writeBuffer(this.buffer, slot * this.planeWords * 4, this.staging);
		this.uploaded.set(index, slot);
	}

	has(index: number): boolean {
		return this.uploaded.has(index);
	}

	/** The slot of plane `index`, which must be in the ring. */
	slot(index: number): number {
		const slot = this.uploaded.get(index);
		if (slot === undefined) throw new Error(`plane ${index} is not in the ring`);
		return slot;
	}

	destroy(): void {
		this.buffer.destroy();
	}
}
