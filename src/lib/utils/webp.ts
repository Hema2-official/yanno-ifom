import type { VideoChannelMetadata } from '$lib/types/api.type';
import type { GeoTIFF, GeoTIFFImage } from 'geotiff';

/** The values a stretch maps to 0 and 255. */
export type ValueRange = [low: number, high: number];

type WebpConversionOptions = {
	statisticsCallback?: (stats: VideoChannelMetadata) => void;
	histogramCallback?: (histogram: Uint32Array) => void;
	normalizeRgb?: boolean;
	/** Stretched from this range, instead of geotiff's 8-bit reading, which keeps only a 16-bit image's top byte. */
	range?: ValueRange;
};

/**
 * Each channel's lowest and highest value over its pages, to stretch a deeper
 * video's frames from; null for an 8-bit video, which is stored as it is.
 */
export async function channelRanges(
	tiff: GeoTIFF,
	channelPeriod: number,
	onPage?: (done: number) => void
): Promise<ValueRange[] | null> {
	if ((await tiff.getImage(0)).getBitsPerSample() <= 8) return null;
	const ranges = Array.from({ length: channelPeriod }, (): ValueRange => [Infinity, -Infinity]);
	const count = await tiff.getImageCount();
	for (let i = 0; i < count; i++) {
		const values = await (await tiff.getImage(i)).readRasters({ interleave: true });
		const range = ranges[i % channelPeriod];
		for (let j = 0; j < values.length; j++) {
			if (values[j] < range[0]) range[0] = values[j];
			if (values[j] > range[1]) range[1] = values[j];
		}
		onPage?.(i + 1);
	}
	return ranges;
}

/** The image's values from `low` to `high`, stretched linearly to 0..255, as RGBA. */
async function stretchedRgba(image: GeoTIFFImage, [low, high]: ValueRange) {
	const values = await image.readRasters({ interleave: true });
	const samples = image.getSamplesPerPixel();
	const scale = high > low ? 255 / (high - low) : 0;
	const [green, blue] = samples >= 3 ? [1, 2] : [0, 0];
	// A clamped array rounds and clamps what it's given
	const rgba = new Uint8ClampedArray(image.getWidth() * image.getHeight() * 4);
	for (let i = 0, j = 0; i < rgba.length; i += 4, j += samples) {
		rgba[i] = (values[j] - low) * scale;
		rgba[i + 1] = (values[j + green] - low) * scale;
		rgba[i + 2] = (values[j + blue] - low) * scale;
		rgba[i + 3] = 255;
	}
	return rgba;
}

export class WebPConverter {
	readonly #canvas: OffscreenCanvas;
	readonly #ctx: OffscreenCanvasRenderingContext2D;

	constructor() {
		this.#canvas = new OffscreenCanvas(1, 1);
		const ctx = this.#canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) throw new Error("Couldn't get 2D context from canvas");
		this.#ctx = ctx;
	}

	async tiffImageToWebP(tiffImage: GeoTIFFImage, options?: WebpConversionOptions) {
		const width = tiffImage.getWidth();
		const height = tiffImage.getHeight();

		// Ensure correct canvas dimensions if they changed
		if (this.#canvas.width !== width || this.#canvas.height !== height) {
			this.#canvas.width = width;
			this.#canvas.height = height;
		}

		let rgbaData: Uint8ClampedArray<ArrayBuffer>;
		if (options?.range) {
			rgbaData = await stretchedRgba(tiffImage, options.range);
		} else {
			// Read pre-processed RGB pixel-interleaved 8-bit array
			const rgbData = await tiffImage.readRGB({ interleave: true });

			// Ensure standard 4-channel RGBA for canvas ImageData
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
		}

		let stats: VideoChannelMetadata | undefined;
		if (options?.statisticsCallback) {
			stats = this.#calculateStats(rgbaData);
			options.statisticsCallback(stats);
		}
		if (options?.histogramCallback)
			options.histogramCallback(this.#calculateHistogram(rgbaData));
		if (options?.normalizeRgb) this.#normalizeRgb(rgbaData, stats);

		this.#ctx.putImageData(new ImageData(rgbaData, width, height), 0, 0);

		// Convert to WebP blob
		return this.#canvas.convertToBlob({ type: 'image/webp', quality: 1 });
	}

	#calculateStats(data: Uint8ClampedArray): VideoChannelMetadata {
		let minR = 255;
		let maxR = 0;
		let minG = 255;
		let maxG = 0;
		let minB = 255;
		let maxB = 0;
		const len = data.length;

		for (let i = 0; i < len; i += 4) {
			const r = data[i];
			const g = data[i + 1];
			const b = data[i + 2];

			if (r < minR) minR = r;
			if (r > maxR) maxR = r;
			if (g < minG) minG = g;
			if (g > maxG) maxG = g;
			if (b < minB) minB = b;
			if (b > maxB) maxB = b;
		}

		return {
			r: { min_value: minR, max_value: maxR },
			g: { min_value: minG, max_value: maxG },
			b: { min_value: minB, max_value: maxB }
		};
	}

	#calculateHistogram(data: Uint8ClampedArray): Uint32Array {
		const histogram = new Uint32Array(256);
		const len = data.length;

		for (let i = 0; i < len; i += 4) {
			let value = data[i];
			if (data[i + 1] > value) value = data[i + 1];
			if (data[i + 2] > value) value = data[i + 2];
			histogram[value]++;
		}

		return histogram;
	}

	#normalizeRgb(data: Uint8ClampedArray, stats?: VideoChannelMetadata) {
		const { r, g, b } = stats ?? this.#calculateStats(data);

		const rangeR = r.max_value - r.min_value;
		const rangeG = g.max_value - g.min_value;
		const rangeB = b.max_value - b.min_value;

		const len = data.length;
		for (let i = 0; i < len; i += 4) {
			data[i] = rangeR > 0 ? Math.round(((data[i] - r.min_value) * 255) / rangeR) : 0;
			data[i + 1] = rangeG > 0 ? Math.round(((data[i + 1] - g.min_value) * 255) / rangeG) : 0;
			data[i + 2] = rangeB > 0 ? Math.round(((data[i + 2] - b.min_value) * 255) / rangeB) : 0;
		}

		return data;
	}
}
