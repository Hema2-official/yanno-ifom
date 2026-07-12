import { projectState } from './ProjectState.svelte';

export class ChannelDisplaySettings {
	visible = $state(false);
	opacity = $state(100); // 0-100

	constructor(visible: boolean) {
		this.visible = visible;
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
