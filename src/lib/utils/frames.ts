import { VideoColor, type VideoConfig, type VideoMetadata } from '$lib/types/api.type';

/**
 * A legacy backend component's naming scheme stuck around in `VideoConfig`:
 * - `channel_period` is the number of channels in the video, and
 * - `start_period` is the index of the primary channel (the one that gets
 *   segmented and tracked).
 *
 * The raw image sequence interleaves the channels, so the image of channel `c`
 * in the 0-based logical frame `f` has raw image index
 * `f * channel_period + c`. Annotation `Frame` values are logical frame
 * numbers of the primary channel.
 */

export type ChannelPeriod = Pick<VideoConfig, 'start_period' | 'channel_period'>;

const SINGLE_CHANNEL_CONFIG: ChannelPeriod = { channel_period: 1, start_period: 0 };

export function getFrameCount(
	config?: VideoConfig,
	metadata?: Pick<VideoMetadata, 'frame_count'>
): number {
	const { channel_period, start_period } = config ?? SINGLE_CHANNEL_CONFIG;
	if (channel_period <= 0) return 0;
	const imageCount = metadata?.frame_count ?? 0;
	if (imageCount <= start_period) return 0;
	return Math.ceil((imageCount - start_period) / channel_period);
}

export type VideoShape = { width: number; height: number; frames: number };

export function videoShape(
	config: VideoConfig,
	metadata: Pick<VideoMetadata, 'frame_count' | 'width' | 'height'>
): VideoShape {
	const { width, height } = metadata;
	return { width, height, frames: getFrameCount(config, metadata) };
}

const colorNames: Record<VideoColor, string> = {
	[VideoColor.GRAYSCALE]: 'Grayscale',
	[VideoColor.RGB]: 'RGB'
};

/** One-line description for project lists, e.g. "Grayscale, 25 frames". */
export function videoSummary(config: VideoConfig, metadata?: VideoMetadata): string {
	return `${colorNames[config.color]}, ${getFrameCount(config, metadata)} frames`;
}

export function getImageIndex(
	config: VideoConfig | undefined,
	frameIndex: number,
	channelIndex: number
): number {
	const { channel_period } = config ?? SINGLE_CHANNEL_CONFIG;
	return frameIndex * channel_period + channelIndex;
}

const MAX_CHANNEL_PERIOD = 5;
/** Bright-pixel fraction under which an image is not a primary frame. */
const MIN_PRIMARY_PRESENCE = 0.005;
/** Dimmest primary / brightest extra image. */
const MIN_SEPARATION_RATIO = 4;
/** Percentile taken as the top of the spectrum, ignoring hot pixels. */
const REFERENCE_PERCENTILE = 0.999;
/** Videos with a lower spectrum top are too dark to tell channels apart. */
const MIN_REFERENCE_BIN = 8;

/**
 * Guesses the channel layout from the histograms of the first raw images:
 * extra channels are much darker than the primary one. Null if no layout stands out.
 */
export function predictChannelPeriod(histograms: Uint32Array[]): ChannelPeriod | null {
	if (histograms.length < 4) return null;

	const brightness = getBrightFractions(histograms);
	if (!brightness) return null;

	let best: ChannelPeriod | null = null;
	let bestScore = 0;

	const maxPeriod = Math.min(MAX_CHANNEL_PERIOD, Math.floor(brightness.length / 2));
	for (let period = 2; period <= maxPeriod; period++) {
		for (let start = 0; start < period; start++) {
			let primaryMin = Infinity;
			let extraMax = 0;
			for (let i = 0; i < brightness.length; i++) {
				if (i % period === start) {
					if (brightness[i] < primaryMin) primaryMin = brightness[i];
				} else if (brightness[i] > extraMax) extraMax = brightness[i];
			}

			if (primaryMin < MIN_PRIMARY_PRESENCE) continue;

			const score = primaryMin / Math.max(extraMax, Number.EPSILON);
			if (score >= MIN_SEPARATION_RATIO && score > bestScore) {
				bestScore = score;
				best = { start_period: start, channel_period: period };
			}
		}
	}

	return best;
}

/** Fraction of each image's pixels in the bright half of the video's spectrum. */
function getBrightFractions(histograms: Uint32Array[]): number[] | null {
	const bins = histograms[0].length;

	const pooled = new Uint32Array(bins);
	let total = 0;
	for (const histogram of histograms) {
		for (let bin = 0; bin < bins; bin++) {
			pooled[bin] += histogram[bin];
			total += histogram[bin];
		}
	}
	if (total === 0) return null;

	let cumulative = 0;
	let referenceBin = bins - 1;
	for (let bin = 0; bin < bins; bin++) {
		cumulative += pooled[bin];
		if (cumulative >= total * REFERENCE_PERCENTILE) {
			referenceBin = bin;
			break;
		}
	}
	if (referenceBin < MIN_REFERENCE_BIN) return null;

	const threshold = referenceBin / 2;
	return histograms.map((histogram) => {
		let bright = 0;
		let count = 0;
		for (let bin = 0; bin < bins; bin++) {
			count += histogram[bin];
			if (bin >= threshold) bright += histogram[bin];
		}
		return count > 0 ? bright / count : 0;
	});
}
