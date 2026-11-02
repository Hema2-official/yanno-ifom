import { downloadZip } from 'client-zip';

/**
 * Downloads (saves) a file with the given data.
 *
 * @param data - The data to be downloaded.
 * @param filename - The name of the file to be downloaded.
 * @param type - The MIME type of the file (default: "text/plain").
 */
export function download(data: BlobPart, filename: string, type: string) {
	const url = URL.createObjectURL(new Blob([data], { type }));
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.tabIndex = -1;
	document.body.appendChild(a);
	a.click();
	setTimeout(function () {
		a.remove();
		URL.revokeObjectURL(url);
	}, 0);
}

export const imageFormats = {
	png: { label: 'PNG', mimeType: 'image/png', extension: 'png', alpha: true, lossy: false },
	jpeg: { label: 'JPEG', mimeType: 'image/jpeg', extension: 'jpg', alpha: false, lossy: true },
	webp: { label: 'WebP', mimeType: 'image/webp', extension: 'webp', alpha: true, lossy: true }
} as const;

export type ImageFormat = keyof typeof imageFormats;

const encodable = new Map<string, boolean>();

/** Whether the browser's canvases can write the type; Safari writes no WebP. */
export function canEncode(format: ImageFormat): boolean {
	const { mimeType } = imageFormats[format];
	let result = encodable.get(mimeType);
	if (result === undefined) {
		const canvas = Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
		result = canvas.toDataURL(mimeType).startsWith(`data:${mimeType}`);
		encodable.set(mimeType, result);
	}
	return result;
}

/** `quality` from 0 to 1, for the lossy formats. */
export function encodeImage(
	canvas: HTMLCanvasElement,
	format: ImageFormat,
	quality: number
): Promise<Blob> {
	const { label, mimeType } = imageFormats[format];
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error(`Couldn't encode the ${label}`))),
			mimeType,
			quality
		)
	);
}

/** The canvas's pixels, without the alpha. */
export function readRgb(canvas: HTMLCanvasElement): Uint8Array<ArrayBuffer> {
	const context = canvas.getContext('2d');
	if (!context) throw new Error("Couldn't read the image");
	const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
	const rgb = new Uint8Array((rgba.length / 4) * 3);
	for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
		rgb[j] = rgba[i];
		rgb[j + 1] = rgba[i + 1];
		rgb[j + 2] = rgba[i + 2];
	}
	return rgb;
}

// The lab's stacks are ImageJ's: big-endian, uncompressed, a strip per page,
// every page's pixels in one run after the first IFD, the other IFDs at the end
const IMAGEJ_VERSION = '1.53c';
const TIFF_HEADER_BYTES = 8;
const TIFF_ENTRIES = 10;
const TIFF_IFD_BYTES = 2 + TIFF_ENTRIES * 12 + 4;
const BITS_PER_SAMPLE_BYTES = 6;
/** Classic TIFF's offsets are 32 bits. */
export const MAX_TIFF_BYTES = 2 ** 32 - 1;

const SHORT = 3;
const LONG = 4;
const ASCII = 2;

const even = (offset: number) => offset + (offset % 2);

/** ImageJ's own description, which it reads the stack's shape from. */
function imageJDescription(pages: number): Uint8Array {
	const lines = [`ImageJ=${IMAGEJ_VERSION}`];
	if (pages > 1) lines.push(`images=${pages}`, `slices=${pages}`, 'loop=false');
	return new TextEncoder().encode(lines.join('\n') + '\n\0');
}

function tiffLayout(width: number, height: number, pages: number) {
	const description = imageJDescription(pages);
	const bitsPerSample = TIFF_HEADER_BYTES + TIFF_IFD_BYTES;
	const descriptionOffset = bitsPerSample + BITS_PER_SAMPLE_BYTES;
	// IFDs start on word boundaries, as the spec asks
	const pixels = even(descriptionOffset + description.length);
	const pageBytes = width * height * 3;
	const tail = even(pixels + pages * pageBytes);
	const size = tail + (pages - 1) * TIFF_IFD_BYTES;
	return { description, bitsPerSample, descriptionOffset, pixels, pageBytes, tail, size };
}

/** The size in bytes of an RGB stack of `pages` pages of `width` × `height`. */
export function tiffSize(width: number, height: number, pages: number): number {
	return tiffLayout(width, height, pages).size;
}

/** An 8-bit RGB stack, as ImageJ writes one, its pages added as they're drawn. */
export class TiffStack {
	readonly #width: number;
	readonly #height: number;
	readonly #pages: number;
	readonly #layout: ReturnType<typeof tiffLayout>;
	readonly #parts: Blob[] = [];
	#added = 0;

	constructor(width: number, height: number, pages: number) {
		this.#width = width;
		this.#height = height;
		this.#pages = pages;
		this.#layout = tiffLayout(width, height, pages);
		if (this.#layout.size > MAX_TIFF_BYTES) throw new Error('The stack would pass 4 GB');

		const { description, bitsPerSample, descriptionOffset, pixels } = this.#layout;
		const head = new DataView(new ArrayBuffer(pixels));
		head.setUint8(0, 0x4d); // MM
		head.setUint8(1, 0x4d);
		head.setUint16(2, 42);
		head.setUint32(4, TIFF_HEADER_BYTES);
		this.#writeIfd(head, TIFF_HEADER_BYTES, 0);
		for (let i = 0; i < 3; i++) head.setUint16(bitsPerSample + i * 2, 8);
		new Uint8Array(head.buffer).set(description, descriptionOffset);
		this.#parts.push(new Blob([head.buffer]));
	}

	/** The next page, from the canvas's pixels (`readRgb`). */
	add(rgb: Uint8Array<ArrayBuffer>) {
		if (this.#added === this.#pages) throw new Error('The stack is full');
		if (rgb.length !== this.#layout.pageBytes) throw new Error('The page has another size');
		this.#parts.push(new Blob([rgb]));
		this.#added++;
	}

	finish(): Blob {
		if (this.#added !== this.#pages) throw new Error('The stack is missing pages');
		const { pixels, pageBytes, tail, size } = this.#layout;
		const padding = tail - (pixels + this.#pages * pageBytes);
		const end = new DataView(new ArrayBuffer(padding + size - tail));
		for (let page = 1; page < this.#pages; page++) {
			this.#writeIfd(end, padding + this.#ifdOffset(page) - tail, page);
		}
		return new Blob([...this.#parts, end.buffer], { type: 'image/tiff' });
	}

	#ifdOffset(page: number): number {
		return page === 0 ? TIFF_HEADER_BYTES : this.#layout.tail + (page - 1) * TIFF_IFD_BYTES;
	}

	/** Writes the page's IFD at `at` in the view, the file's offset being `#ifdOffset(page)`. */
	#writeIfd(view: DataView, at: number, page: number) {
		const { description, bitsPerSample, descriptionOffset, pixels, pageBytes } = this.#layout;
		// The reference's tags in its order, less the resolution
		const entries: [tag: number, type: number, count: number, value: number][] = [
			[254, LONG, 1, 0], // NewSubfileType
			[256, LONG, 1, this.#width], // ImageWidth
			[257, LONG, 1, this.#height], // ImageLength
			[258, SHORT, 3, bitsPerSample], // BitsPerSample, 8 each
			[262, SHORT, 1, 2], // PhotometricInterpretation: RGB
			[270, ASCII, description.length, descriptionOffset], // ImageDescription
			[273, LONG, 1, pixels + page * pageBytes], // StripOffsets
			[277, SHORT, 1, 3], // SamplesPerPixel
			[278, SHORT, 1, this.#height], // RowsPerStrip
			[279, LONG, 1, pageBytes] // StripByteCounts
		];
		view.setUint16(at, entries.length);
		entries.forEach(([tag, type, count, value], i) => {
			const entry = at + 2 + i * 12;
			view.setUint16(entry, tag);
			view.setUint16(entry + 2, type);
			view.setUint32(entry + 4, count);
			// A value that fits sits in the entry, left-justified; a longer one is an offset
			if (type === SHORT && count === 1) view.setUint16(entry + 8, value);
			else view.setUint32(entry + 8, value);
		});
		const next = page + 1 < this.#pages ? this.#ifdOffset(page + 1) : 0;
		view.setUint32(at + 2 + entries.length * 12, next);
	}
}

export type ZipEntry = { name: string; input: Blob; lastModified: Date };

/** A ZIP of the files as they come, stored without compression. */
export async function zipFiles(files: AsyncIterable<ZipEntry>): Promise<Blob> {
	const zip = await downloadZip(files).blob();
	return new Blob([zip], { type: 'application/zip' });
}

const MiB = 2 ** 20;

export function bytesLabel(bytes: number): string {
	if (bytes >= 1024 * MiB) return `${(bytes / (1024 * MiB)).toFixed(1)} GB`;
	if (bytes >= MiB) return `${(bytes / MiB).toFixed(1)} MB`;
	return `${Math.ceil(bytes / 1024)} KB`;
}
