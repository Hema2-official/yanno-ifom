import type { GeoTIFFImage } from 'geotiff';

export class WebPConverter {
	readonly #canvas: OffscreenCanvas;
	readonly #ctx: OffscreenCanvasRenderingContext2D;

	constructor() {
		this.#canvas = new OffscreenCanvas(1, 1);
		const ctx = this.#canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) throw new Error("Couldn't get 2D context from canvas");
		this.#ctx = ctx;
	}

	async tiffImageToWebP(tiffImage: GeoTIFFImage) {
		const width = tiffImage.getWidth();
		const height = tiffImage.getHeight();

		// Ensure correct canvas dimensions if they changed
		if (this.#canvas.width !== width || this.#canvas.height !== height) {
			this.#canvas.width = width;
			this.#canvas.height = height;
		}

		// Read pre-processed RGB pixel-interleaved 8-bit array
		const rgbData = await tiffImage.readRGB({ interleave: true });

		// Ensure standard 4-channel RGBA for canvas ImageData
		let rgbaData: Uint8ClampedArray<ArrayBuffer>;
		if (rgbData.length === width * height * 4) {
			rgbaData = new Uint8ClampedArray(
				rgbData.buffer as ArrayBuffer,
				rgbData.byteOffset,
				rgbData.length
			);
		} else {
			rgbaData = new Uint8ClampedArray(width * height * 4);
			const rgba32 = new Uint32Array(rgbaData.buffer);
			for (let j = 0; j < width * height; j++) {
				const srcIdx = j * 3;
				const r = rgbData[srcIdx];
				const g = rgbData[srcIdx + 1];
				const b = rgbData[srcIdx + 2];
				// Write R, G, B, and A (255) in a single 32-bit store operation
				rgba32[j] = 0xff000000 | (b << 16) | (g << 8) | r;
			}
		}

		this.#ctx.putImageData(new ImageData(rgbaData, width, height), 0, 0);

		// Convert to WebP blob
		return this.#canvas.convertToBlob({ type: 'image/webp', quality: 1 });
	}
}
