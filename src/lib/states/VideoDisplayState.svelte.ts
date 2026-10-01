import {
	colormapToRgbFunctions,
	getAdjustFunctions,
	getNormalizeFunctions,
	type RGBFunctions
} from '$lib/utils/imaging';
import { clamp } from '$lib/utils/math';
import type { DisplayView } from '$lib/utils/snapshots';
import { projectState } from './ProjectState.svelte';
import { oneOf, SettingState } from './SettingState.svelte';
import { svgState } from './svg.svelte';

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

/** A filter an image goes through: its `<filter>`'s id and what it does to the colors. */
export type FilterStep = { id: string; functions: RGBFunctions };

export type FilterSwitches = { normalized: boolean; colormapped: boolean };

export const displayModes = ['grid', 'stack'] as const;
export type DisplayMode = (typeof displayModes)[number];

/** How many frames each layout shows at most: the stack's overlap keeps it compact. */
const MAX_FRAMES: Record<DisplayMode, number> = { grid: 6, stack: 24 };

/** The angles the stack turns within, in degrees. */
export const STACK_YAW = { min: -80, max: 80 };
export const STACK_PITCH = { min: -30, max: 30 };

export type StackAngles = { yaw: number; pitch: number };

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

	channelFilters: FilterStep[][] = $derived(
		this.filtersFor({
			normalized: svgState.normalizeSwitch.current,
			colormapped: svgState.colormapSwitch.current
		})
	);

	filtersFor({ normalized, colormapped }: FilterSwitches): FilterStep[][] {
		const metadata = projectState.videoMetadata;
		const colormap: FilterStep | null = colormapped
			? {
					id: 'colormap-f',
					functions: colormapToRgbFunctions(
						svgState.videoColormap.current,
						svgState.videoColormapShades.current
					)
				}
			: null;

		return this.channels.map(({ isAdjusted, brightness, contrast, gamma }, index) => {
			const steps: FilterStep[] = [];
			if (normalized && metadata?.channels[index]) {
				const functions = getNormalizeFunctions(metadata, index);
				steps.push({ id: `normalize-f-${index}`, functions });
			}
			if (isAdjusted) {
				const functions = getAdjustFunctions(brightness, contrast, gamma);
				steps.push({ id: `adjust-f-${index}`, functions });
			}
			if (colormap) steps.push(colormap);
			return steps;
		});
	}

	displayMode = new SettingState<DisplayMode>('displayMode', 'grid', {
		validate: oneOf(displayModes)
	});
	stackYaw = new SettingState('stackYaw', 55);
	stackPitch = new SettingState('stackPitch', 12);
	stackSpacing = new SettingState('stackSpacing', 0.1);
	stackFade = new SettingState('stackFade', 0);

	maxConcurrentFrames = $derived(
		clamp(projectState.frameCount, 1, MAX_FRAMES[this.displayMode.current])
	);

	// TODO: remember separately for grid and stack
	// Kept beyond the grid's cap, so switching back to the stack restores it
	#concurrentFrames = $state(1);

	/** Number of consecutive frames displayed at once. */
	get concurrentFrames(): number {
		return Math.min(this.#concurrentFrames, this.maxConcurrentFrames);
	}
	set concurrentFrames(value: number) {
		this.#concurrentFrames = value;
	}

	/** The last frame the shown window can start at. */
	maxFrameIndex = $derived(Math.max(0, projectState.frameCount - this.concurrentFrames));

	readView: (() => DisplayView) | null = $state.raw(null);

	#turn: StackAngles | null = $state.raw(null);
	isTurning = $derived(this.#turn !== null);

	get restingAngles(): StackAngles {
		return { yaw: this.stackYaw.current, pitch: this.stackPitch.current };
	}

	get stackAngles(): StackAngles {
		return this.#turn ?? this.restingAngles;
	}

	turnStack(yaw: number, pitch: number) {
		const angles = this.stackAngles;
		this.#turn = {
			yaw: clamp(angles.yaw + yaw, STACK_YAW.min, STACK_YAW.max),
			pitch: clamp(angles.pitch + pitch, STACK_PITCH.min, STACK_PITCH.max)
		};
	}

	endTurn() {
		if (!this.#turn) return;
		this.stackYaw.current = this.#turn.yaw;
		this.stackPitch.current = this.#turn.pitch;
		this.#turn = null;
	}

	cancelTurn() {
		this.#turn = null;
	}

	/** Back to one frame shown. */
	reset() {
		this.#concurrentFrames = 1;
	}
}

export const videoDisplayState = new VideoDisplayState();
