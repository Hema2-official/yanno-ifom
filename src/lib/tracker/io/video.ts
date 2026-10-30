/**
 * Multi-page TIFF videos, read through geotiff.js from a Blob (a File in the browser) page by page, never
 * as a whole. geotiff reads classic and BigTIFF files in both byte orders, with strips or tiles,
 * uncompressed or compressed (LZW, Deflate, PackBits, JPEG, Zstd, WebP, LERC); the frame preparation
 * takes 8- and 16-bit unsigned single-channel pages.
 *
 * Two of geotiff's readings are wrong for big-endian files and are done differently here:
 * - tag arrays outside the first kilobyte of their directory are loaded lazily, as little-endian values,
 *   so the directories are parsed eagerly, which reads every value in the file's byte order;
 * - the horizontal predictor of 16-bit samples is undone in the machine's byte order, so for big-endian
 *   files the decoders run without it and the predictor is undone in the file's byte order.
 */
import { GeoTIFF, getDecoder, type GeoTIFFImage, type Pool } from 'geotiff';

/** A page's size and depth, checked to be one the frame preparation takes. */
export interface VideoPage {
	/** the page's position in the file */
	readonly index: number;
	readonly width: number;
	readonly height: number;
	readonly bitsPerSample: 8 | 16;
}

interface Slice {
	offset: number;
	length: number;
}

/**
 * geotiff's data source over a Blob. Reads smaller than the window (the image directories, their tag
 * arrays, small strips) are served from one cached window, so neighbouring ones cost one slice of the
 * Blob; larger reads (whole pages) are sliced directly.
 */
class BlobSource {
	private window: { start: number; end: number; bytes: Promise<ArrayBuffer> } | null = null;

	constructor(
		private readonly file: Blob,
		private readonly windowSize = 1 << 16
	) {}

	get fileSize(): number {
		return this.file.size;
	}

	fetch(slices: readonly Slice[]): Promise<ArrayBuffer[]> {
		return Promise.all(slices.map((slice) => this.read(slice.offset, slice.length)));
	}

	async fetchSlice(slice: Slice): Promise<Slice & { data: ArrayBuffer }> {
		return { ...slice, data: await this.read(slice.offset, slice.length) };
	}

	async close(): Promise<void> {}

	private async read(offset: number, length: number): Promise<ArrayBuffer> {
		const end = Math.min(offset + length, this.file.size);
		if (length >= this.windowSize) return this.file.slice(offset, end).arrayBuffer();
		let window = this.window;
		if (window === null || offset < window.start || end > window.end) {
			const windowEnd = Math.min(offset + this.windowSize, this.file.size);
			window = this.window = {
				start: offset,
				end: windowEnd,
				bytes: this.file.slice(offset, windowEnd).arrayBuffer()
			};
		}
		return (await window.bytes).slice(offset - window.start, end - window.start);
	}
}

type DecoderParameters = Parameters<typeof getDecoder>[1];

/** Undoes the horizontal predictor on a decoded block of big-endian 16-bit samples, `width` samples per row. */
function accumulateBigEndian16(block: ArrayBufferLike, width: number): void {
	const bytes = new Uint8Array(block);
	const rowBytes = 2 * width;
	for (let start = 0; start + rowBytes <= bytes.length; start += rowBytes) {
		let value = (bytes[start] << 8) | bytes[start + 1];
		for (let i = start + 2; i < start + rowBytes; i += 2) {
			value = (value + ((bytes[i] << 8) | bytes[i + 1])) & 0xffff;
			bytes[i] = value >> 8;
			bytes[i + 1] = value & 0xff;
		}
	}
}

/**
 * Decoders for big-endian files, given to readRasters as its pool (they run in the calling thread): with
 * 16-bit samples and the horizontal predictor, geotiff's decoder runs without the predictor, which is then
 * undone in the file's byte order.
 */
const bigEndianDecoders = {
	bindParameters(compression: number, parameters: DecoderParameters) {
		const bits = parameters.bitsPerSample;
		const predicted =
			parameters.predictor === 2 && Number(typeof bits === 'number' ? bits : bits[0]) === 16;
		let decoder: ReturnType<typeof getDecoder> | null = null;
		return {
			async decode(buffer: ArrayBufferLike): Promise<ArrayBufferLike> {
				decoder ??= getDecoder(
					compression,
					predicted ? { ...parameters, predictor: 1 } : parameters
				);
				const block = await (await decoder).decode(buffer);
				if (predicted) accumulateBigEndian16(block, parameters.tileWidth);
				return block;
			}
		};
	}
} as unknown as Pool;

function checkedPage(index: number, image: GeoTIFFImage): VideoPage {
	const samples = image.getSamplesPerPixel(),
		bits = image.getBitsPerSample(),
		format = image.getSampleFormat();
	if (samples !== 1)
		throw new Error(
			`TIFF page ${index}: only single-channel pages are supported (${samples} samples per pixel)`
		);
	if (bits !== 8 && bits !== 16)
		throw new Error(
			`TIFF page ${index}: only 8- and 16-bit pages are supported (${bits} bits)`
		);
	if (format !== 1)
		throw new Error(
			`TIFF page ${index}: only unsigned integer samples are supported (sample format ${format})`
		);
	return { index, width: image.getWidth(), height: image.getHeight(), bitsPerSample: bits };
}

/** A TIFF video: its number of pages, and each page's size and samples. geotiff keeps the parsed directories. */
export class TiffVideo {
	private constructor(
		private readonly tiff: GeoTIFF,
		readonly pageCount: number
	) {}

	/** Opens a video and walks its chain of image directories. */
	static async open(file: Blob): Promise<TiffVideo> {
		const tiff = await GeoTIFF.fromSource(new BlobSource(file));
		tiff.parser.eager = true;
		// geotiff's own count follows the chain without end when it loops
		const seen = new Set<number>([tiff.firstIFDOffset]);
		let count = 0;
		for (;;) {
			const next = Number((await tiff.requestIFD(count++)).nextIFDByteOffset);
			if (next === 0) break;
			if (seen.has(next)) throw new Error('TIFF: the directory chain loops');
			seen.add(next);
		}
		return new TiffVideo(tiff, count);
	}

	/** Page `index`'s size and depth; throws for a page the frame preparation does not take. */
	async page(index: number): Promise<VideoPage> {
		return checkedPage(index, await this.tiff.getImage(index));
	}

	/** Page `index`'s samples, rows top to bottom. */
	async samples(index: number): Promise<Uint8Array | Uint16Array> {
		const image = await this.tiff.getImage(index);
		checkedPage(index, image);
		try {
			const pool = this.tiff.littleEndian ? null : bigEndianDecoders;
			return (await image.readRasters({ samples: [0], interleave: true, pool })) as
				| Uint8Array
				| Uint16Array;
		} catch (error) {
			throw new Error(`TIFF page ${index}: ${(error as Error).message}`, { cause: error });
		}
	}
}
