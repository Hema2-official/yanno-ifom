import { getAbortSignal, untrack } from 'svelte';
import { watch } from 'runed';
import { z } from 'zod';
import type { VideoChannelMetadata, VideoMetadata } from '$lib/types/api.type';
import {
	AVAILABLE_COLORMAPS,
	colormapToRgbFunctions,
	countPixels,
	getAdjustFunctions,
	getNormalizeFunctions,
	percentileRange,
	type ColorMapType,
	type RGBFunctions
} from '$lib/utils/imaging';
import { clamp } from '$lib/utils/math';
import type { DisplayView } from '$lib/utils/snapshots';
import { frameCache } from './FrameCache.svelte';
import { projectState } from './ProjectState.svelte';
import { oneOf, SettingState } from './SettingState.svelte';
import { svgState } from './svg.svelte';

export const displayModes = ['grid', 'stack'] as const;
export type DisplayMode = (typeof displayModes)[number];

const layoutLookSchema = z.object({ visible: z.boolean(), opacity: z.number() });

/** A channel's look, which the project remembers. */
const channelSettingsSchema = z.object({
	grid: layoutLookSchema,
	stack: layoutLookSchema,
	brightness: z.number(),
	contrast: z.number(),
	gamma: z.number(),
	normalized: z.boolean(),
	saturated: z.number(),
	colormapped: z.boolean(),
	colormap: z.enum(AVAILABLE_COLORMAPS)
});
export type ChannelSettings = z.infer<typeof channelSettingsSchema>;

/** What the project's preferences key holds: of each channel, the fields that differ from the defaults. */
const projectDisplaySchema = z.object({ channels: z.array(channelSettingsSchema.partial()) });
type ProjectDisplay = z.infer<typeof projectDisplaySchema>;

const NO_CHANGES: ProjectDisplay = { channels: [] };

const defaultSettings = (visible: boolean): ChannelSettings => ({
	grid: { visible, opacity: 1 },
	stack: { visible, opacity: 1 },
	brightness: 0,
	contrast: 1,
	gamma: 1,
	normalized: true,
	saturated: 0,
	colormapped: true,
	colormap: 'viridis'
});

/** JSON with the keys in order, the same for a value from any store. */
const stableJson = (value: unknown) =>
	JSON.stringify(value, (_: string, v: unknown) =>
		v && typeof v === 'object' && !Array.isArray(v)
			? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
			: v
	);

export class ChannelDisplaySettings {
	// Each layout has its own
	#shown: Record<DisplayMode, { visible: boolean; opacity: number }>;

	normalized = $state(true);
	/** The percent of pixels the normalization lets saturate, half at each end; 0 keeps the full range. */
	saturated = $state(0);

	// Applied after the normalization, before the colormap
	brightness = $state(0); // -1 to 1, a fraction of the full range
	contrast = $state(1); // multiplier
	gamma = $state(1);

	colormapped = $state(true);
	colormap: ColorMapType = $state('viridis');

	isAdjusted = $derived(this.brightness !== 0 || this.contrast !== 1 || this.gamma !== 1);

	readonly #defaults: ChannelSettings;

	constructor(defaults: ChannelSettings, stored?: Partial<ChannelSettings>) {
		this.#defaults = defaults;
		this.#shown = $state({ grid: { ...defaults.grid }, stack: { ...defaults.stack } });
		this.load(stored);
	}

	get #layout() {
		return this.#shown[videoDisplayState.displayMode.current];
	}

	get visible(): boolean {
		return this.#layout.visible;
	}
	set visible(value: boolean) {
		this.#layout.visible = value;
	}

	/** From 0 to 1. */
	get opacity(): number {
		return this.#layout.opacity;
	}
	set opacity(value: number) {
		this.#layout.opacity = value;
	}

	/** The look as plain data. */
	get settings(): ChannelSettings {
		const { grid, stack } = $state.snapshot(this.#shown);
		return {
			grid,
			stack,
			brightness: this.brightness,
			contrast: this.contrast,
			gamma: this.gamma,
			normalized: this.normalized,
			saturated: this.saturated,
			colormapped: this.colormapped,
			colormap: this.colormap
		};
	}

	/** The fields that differ from the defaults, what the project stores. */
	get changes(): Partial<ChannelSettings> {
		const defaults: Record<string, unknown> = this.#defaults;
		return Object.fromEntries(
			Object.entries(this.settings).filter(
				([key, value]) => stableJson(value) !== stableJson(defaults[key])
			)
		);
	}

	/** Whether the filters differ from the defaults; the layouts' visibility and opacity don't count. */
	isChanged = $derived(
		Object.keys(this.changes).some((key) => key !== 'grid' && key !== 'stack')
	);

	/** Takes a stored look over the defaults. */
	load(stored: Partial<ChannelSettings> = {}) {
		const settings = { ...this.#defaults, ...stored };
		this.#shown.grid = { ...settings.grid };
		this.#shown.stack = { ...settings.stack };
		this.brightness = settings.brightness;
		this.contrast = settings.contrast;
		this.gamma = settings.gamma;
		this.normalized = settings.normalized;
		this.saturated = settings.saturated;
		this.colormapped = settings.colormapped;
		this.colormap = settings.colormap;
	}

	resetFilters() {
		const { grid, stack } = this.settings;
		this.load({ grid, stack });
	}
}

/** The looks as the project stores them, `NO_CHANGES` itself while every channel has the defaults. */
function toStored(channels: ChannelDisplaySettings[]): ProjectDisplay {
	const changes = channels.map((channel) => channel.changes);
	return changes.some((change) => Object.keys(change).length > 0)
		? { channels: changes }
		: NO_CHANGES;
}

/** A filter an image goes through: its `<filter>`'s id and what it does to the colors. */
export type FilterStep = { id: string; functions: RGBFunctions };

/** Masks over the channels' own switches, for an export. */
export type FilterSwitches = { normalized: boolean; colormapped: boolean };

/** How many frames each layout shows at most: the stack's overlap keeps it compact. */
const MAX_FRAMES: Record<DisplayMode, number> = { grid: 6, stack: 24 };

/** The angles the stack turns within, in degrees. */
export const STACK_YAW = { min: -80, max: 80 };
export const STACK_PITCH = { min: -30, max: 30 };

export type StackAngles = { yaw: number; pitch: number };

/** How many frames of each channel the percentile normalization counts the pixels of. */
const COUNTED_FRAMES = 16;

class VideoDisplayState {
	/** The loaded project's remembered looks, null without a project. */
	#display: SettingState<ProjectDisplay> | null = $state.raw(null);

	/**
	 * Per-channel display settings, shared by every displayed frame: the
	 * project's stored look over the defaults (only the primary channel
	 * visible), re-created whenever a project opens.
	 */
	channels: ChannelDisplaySettings[] = $derived.by(() => {
		const config = projectState.videoConfig;
		const display = this.#display;
		const stored = untrack(() => display?.current.channels ?? []);
		return Array.from(
			{ length: config?.channel_period ?? 1 },
			(_, i) =>
				new ChannelDisplaySettings(
					defaultSettings(i === (config?.start_period ?? 0)),
					stored[i]
				)
		);
	});

	/** Keeps the project's looks under its key; a local project's stay on the device. */
	open(key: string, { local }: { local: boolean }) {
		this.#display = new SettingState<ProjectDisplay>(`display.${key}`, NO_CHANGES, {
			local,
			validate: (value): value is ProjectDisplay =>
				projectDisplaySchema.safeParse(value).success
		});
	}

	/** A sample of each channel's frames, as counts of each value of red, green and blue. */
	#pixelCounts = $state.raw<{ metadata: VideoMetadata; counts: Uint32Array[][] } | null>(null);

	/** Each channel's range the normalization stretches to the full one. */
	#normalizeRanges: VideoChannelMetadata[] = $derived.by(() => {
		const metadata = projectState.videoMetadata;
		const pixels = this.#pixelCounts;
		if (!metadata) return [];
		return metadata.channels.map((channel, index) => {
			const saturated = this.channels[index]?.saturated ?? 0;
			if (saturated === 0 || pixels?.metadata !== metadata) return channel;
			const [r, g, b] = pixels.counts[index].map((counts) =>
				percentileRange(counts, saturated)
			);
			return r && g && b ? { r, g, b } : channel;
		});
	});

	constructor() {
		$effect.root(() => {
			// Counted once per project, when a percentile is first wanted
			$effect(() => {
				const metadata = projectState.videoMetadata;
				if (!metadata || !this.channels.some((channel) => channel.saturated > 0)) return;
				if (untrack(() => this.#pixelCounts?.metadata) === metadata) return;

				const signal = getAbortSignal();
				void this.#countPixels(metadata).then((counts) => {
					if (!signal.aborted) this.#pixelCounts = { metadata, counts };
				});
			});

			// A change here goes to the project's key, which an untouched project leaves unset
			watch([() => this.#display, () => toStored(this.channels)], ([display, ours]) => {
				if (!display || stableJson(ours) === stableJson(display.current)) return;
				if (ours === NO_CHANGES) display.reset();
				else display.current = ours;
			});

			// The key's value from another tab, or from the account once it's known
			watch([() => this.#display?.current], ([stored]) => {
				const display = this.#display;
				if (!display || stableJson(stored) === stableJson(toStored(this.channels))) return;
				this.channels.forEach((channel, i) => channel.load(stored?.channels[i]));
			});
		});
	}

	async #countPixels(metadata: VideoMetadata): Promise<Uint32Array[][]> {
		const frameCount = projectState.frameCount;
		const sampled = Math.min(frameCount, COUNTED_FRAMES);
		const frames = Array.from({ length: sampled }, (_, i) =>
			Math.floor((i * frameCount) / sampled)
		);
		return Promise.all(
			metadata.channels.map(async (_, channelIndex) => {
				const counts = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
				for (const frameIndex of frames) {
					const imageIndex = projectState.imageIndex(frameIndex, channelIndex);
					if (imageIndex === null) continue;
					try {
						const image = await createImageBitmap(
							await frameCache.readUncached(imageIndex)
						);
						countPixels(counts, image);
						image.close();
					} catch {
						// An unreadable frame is left out
					}
				}
				return counts;
			})
		);
	}

	channelFilters: FilterStep[][] = $derived(
		this.filtersFor({ normalized: true, colormapped: true })
	);

	filtersFor({ normalized, colormapped }: FilterSwitches): FilterStep[][] {
		const shades = svgState.videoColormapShades.current;
		return this.channels.map((channel, index) => {
			const steps: FilterStep[] = [];
			const range = this.#normalizeRanges[index];
			if (normalized && channel.normalized && range) {
				steps.push({ id: `normalize-f-${index}`, functions: getNormalizeFunctions(range) });
			}
			if (channel.isAdjusted) {
				const { brightness, contrast, gamma } = channel;
				const functions = getAdjustFunctions(brightness, contrast, gamma);
				steps.push({ id: `adjust-f-${index}`, functions });
			}
			if (colormapped && channel.colormapped) {
				const functions = colormapToRgbFunctions(channel.colormap, shades);
				steps.push({ id: `colormap-f-${index}`, functions });
			}
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

	// Each layout has its own
	#concurrentFrames: Record<DisplayMode, number> = $state({ grid: 1, stack: 1 });

	/** Number of consecutive frames displayed at once. */
	get concurrentFrames(): number {
		const count = this.#concurrentFrames[this.displayMode.current];
		return Math.min(count, this.maxConcurrentFrames);
	}
	set concurrentFrames(value: number) {
		this.#concurrentFrames[this.displayMode.current] = value;
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

	/** Back to one frame shown, without a project's looks. */
	reset() {
		this.#concurrentFrames = { grid: 1, stack: 1 };
		this.#display = null;
	}
}

export const videoDisplayState = new VideoDisplayState();
