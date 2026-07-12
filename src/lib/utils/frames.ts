import type { VideoConfig, VideoMetadata } from '$lib/types/api.type';

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

const SINGLE_CHANNEL_CONFIG = { channel_period: 1, start_period: 0 };

export function getFrameCount(
	config: VideoConfig | null | undefined,
	metadata: VideoMetadata | null | undefined
): number {
	const { channel_period, start_period } = config ?? SINGLE_CHANNEL_CONFIG;
	if (channel_period <= 0) return 0;
	const imageCount = metadata?.frame_count ?? 0;
	if (imageCount <= start_period) return 0;
	return Math.ceil((imageCount - start_period) / channel_period);
}

export function getImageIndex(
	config: VideoConfig | null | undefined,
	frameIndex: number,
	channelIndex: number
): number {
	const { channel_period } = config ?? SINGLE_CHANNEL_CONFIG;
	return frameIndex * channel_period + channelIndex;
}
