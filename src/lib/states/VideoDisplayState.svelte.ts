import { projectState } from './ProjectState.svelte';

export class ChannelDisplaySettings {
	visible = $state(false);
	opacity = $state(1); // 0-1

	// Applied after the normalization, before the colormap
	brightness = $state(0); // -1 to 1, a fraction of the full range
	contrast = $state(1); // multiplier
	gamma = $state(1);

	isAdjusted = $derived(this.brightness !== 0 || this.contrast !== 1 || this.gamma !== 1);

	constructor(visible: boolean) {
		this.visible = visible;
	}

	resetAdjustments() {
		this.brightness = 0;
		this.contrast = 1;
		this.gamma = 1;
	}
}

class VideoDisplayState {
	/**
	 * Per-channel display settings, shared by every displayed frame.
	 * Re-created with defaults (only the primary channel visible) whenever
	 * the loaded project's video config changes.
	 */
	channels: ChannelDisplaySettings[] = $derived.by(() => {
		const config = projectState.videoConfig;
		return Array.from(
			{ length: config?.channel_period ?? 1 },
			(_, i) => new ChannelDisplaySettings(i === (config?.start_period ?? 0))
		);
	});

	/** Number of consecutive frames displayed at once in the grid. */
	concurrentFrames = $state(1);
}

export const videoDisplayState = new VideoDisplayState();
