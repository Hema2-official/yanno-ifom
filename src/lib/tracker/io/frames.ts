/**
 * The frames of one channel of a video as cell-tracking-backend prepares them for the models
 * (src/tracking_runner/frames.py write_model_frames): every channelPeriod-th page from startPeriod on,
 * the lowest value of those pages subtracted, each frame stretched over its own range to 8 bits
 * (cv2.normalize, NORM_MINMAX); an RGB frame's three colors share the lowest value and the range, as
 * OpenCV takes them over all of a color image's values. The lowest value needs every page first, so the video is read twice:
 * pass 1 (scanChannel) keeps each page's range, pass 2 (ChannelFrames) makes a frame when it is needed.
 */
import { normalizationTable } from './normalize';
import type { TiffVideo, VideoPage } from './video';

/** The pages of one channel, by their index in the file: every channelPeriod-th page from startPeriod on (pages[startPeriod::channelPeriod]). */
export function selectChannel(
	pageCount: number,
	channelPeriod: number,
	startPeriod: number
): number[] {
	if (!(channelPeriod >= 1) || !(startPeriod >= 0))
		throw new Error(`invalid channel period ${channelPeriod} or start ${startPeriod}`);
	const selected: number[] = [];
	for (let k = startPeriod; k < pageCount; k += channelPeriod) selected.push(k);
	return selected;
}

/** Pass 1: the range of every page of a channel. Small (a few bytes per page), so it can be kept for later steps. */
export interface ChannelScan {
	/** the channel's pages, by their index in the file */
	readonly pages: readonly number[];
	readonly width: number;
	readonly height: number;
	/** 1 for gray, 3 for RGB, whose frames interleave the colors */
	readonly samplesPerPixel: 1 | 3;
	readonly minimum: Uint16Array;
	readonly maximum: Uint16Array;
	/** the lowest value of the channel, which the backend subtracts from every frame */
	readonly low: number;
}

/** The smallest and largest of a page's samples. */
export function sampleRange(samples: Uint8Array | Uint16Array): [number, number] {
	let min = 65535,
		max = 0;
	for (let i = 0; i < samples.length; i++) {
		const v = samples[i];
		if (v < min) min = v;
		if (v > max) max = v;
	}
	return [min, max];
}

/** Pass 1 over the channel's pages, reading the next page while the current one is scanned. */
export async function scanChannel(
	video: TiffVideo,
	pages: readonly number[]
): Promise<ChannelScan> {
	if (pages.length === 0) throw new Error('Failed to load frames from video');
	const first = await video.page(pages[0]);
	for (const index of pages) {
		const p = await video.page(index);
		if (
			p.width !== first.width ||
			p.height !== first.height ||
			p.bitsPerSample !== first.bitsPerSample ||
			p.samplesPerPixel !== first.samplesPerPixel
		) {
			const kind = (page: VideoPage) =>
				`${page.width}x${page.height}, ${page.samplesPerPixel === 3 ? 'RGB' : 'gray'}, ${page.bitsPerSample} bits`;
			throw new Error(
				`TIFF page ${index} is ${kind(p)}; page ${first.index} is ${kind(first)}`
			);
		}
	}
	const minimum = new Uint16Array(pages.length),
		maximum = new Uint16Array(pages.length);
	let next = video.samples(pages[0]);
	for (let k = 0; k < pages.length; k++) {
		const samples = await next;
		if (k + 1 < pages.length) next = video.samples(pages[k + 1]);
		[minimum[k], maximum[k]] = sampleRange(samples);
	}
	let low = 65535;
	for (let k = 0; k < pages.length; k++) if (minimum[k] < low) low = minimum[k];
	return {
		pages,
		width: first.width,
		height: first.height,
		samplesPerPixel: first.samplesPerPixel,
		minimum,
		maximum,
		low
	};
}

/**
 * Frame `index` from its page's samples: (frame - low) normalized over its own range, through one lookup
 * table (`table`, at least 65536 entries) and one pass over the pixels. Written into `out` (as many bytes
 * as samples, row-major), which is returned.
 */
export function prepareFrame(
	samples: Uint8Array | Uint16Array,
	scan: ChannelScan,
	index: number,
	table: Uint8Array,
	out: Uint8Array
): Uint8Array {
	const min = scan.minimum[index],
		max = scan.maximum[index];
	normalizationTable(min - scan.low, max - scan.low, table);
	// table entry v - min holds the value of a sample v
	for (let i = 0; i < samples.length; i++) out[i] = table[samples[i] - min];
	return out;
}

/** Pass 2: the frames of a scanned channel, made on demand; reading the next page overlaps with the current frame. */
export class ChannelFrames {
	private readonly table = new Uint8Array(65536);
	private prefetched: { index: number; samples: Promise<Uint8Array | Uint16Array> } | null = null;

	constructor(
		private readonly video: TiffVideo,
		readonly scan: ChannelScan
	) {}

	get width(): number {
		return this.scan.width;
	}

	get height(): number {
		return this.scan.height;
	}

	get samplesPerPixel(): 1 | 3 {
		return this.scan.samplesPerPixel;
	}

	get count(): number {
		return this.scan.pages.length;
	}

	/** Frame `index`, written into `out` (height * width * samplesPerPixel bytes, row-major), which is returned. */
	async frame(
		index: number,
		out: Uint8Array = new Uint8Array(this.width * this.height * this.samplesPerPixel)
	): Promise<Uint8Array> {
		const pages = this.scan.pages;
		const samples =
			this.prefetched?.index === index
				? await this.prefetched.samples
				: await this.video.samples(pages[index]);
		this.prefetched = null;
		if (index + 1 < pages.length) {
			const next = this.video.samples(pages[index + 1]);
			next.catch(() => undefined); // a read that is never awaited must not fail unhandled; awaiting it still throws
			this.prefetched = { index: index + 1, samples: next };
		}
		return prepareFrame(samples, this.scan, index, this.table, out);
	}
}
