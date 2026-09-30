import { watch } from 'runed';
import { SvelteMap } from 'svelte/reactivity';
import type { RGBFunctions } from '$lib/utils/imaging';
import { bakeImage, snapshotSize } from '$lib/utils/snapshots';
import { frameCache } from './FrameCache.svelte';
import { projectState } from './ProjectState.svelte';
import { SettingState } from './SettingState.svelte';
import { svgState } from './svg.svelte';
import { videoDisplayState } from './VideoDisplayState.svelte';

/** A visible channel of a frame: its image in the video, and how the display draws it. */
type Layer = { imageIndex: number; opacity: number; transfer: RGBFunctions[] };

/** The memory a canvas of this size takes, in bytes. */
const bytesOf = ({ width, height }: { width: number; height: number }) => width * height * 4;

const whenIdle = (callback: () => void) =>
	typeof requestIdleCallback === 'function'
		? requestIdleCallback(callback, { timeout: 1000 })
		: window.setTimeout(callback, 50);

/** Frame images baked with their filters into canvases */
class FrameSnapshots {
	maxBytes = new SettingState('snapshotMaxBytes', 512 * 1024 * 1024, { local: true });
	totalBytes = $state(0);

	#entries = new SvelteMap<number, { key: string; canvas: HTMLCanvasElement }>();
	#failed = new Set<string>();

	constructor() {
		// Drop frames when budget shrinks
		$effect.root(() => {
			watch([() => this.maxBytes.current], ([budget]) => this.#evict(budget), { lazy: true });
		});
	}

	#looks = $derived(
		videoDisplayState.channels.map(({ visible, opacity }, channelIndex) => {
			if (!visible) return null;
			const filters = videoDisplayState.channelFilters[channelIndex];
			return { opacity, transfer: filters.map(({ functions }) => functions) };
		})
	);
	#lookKey = $derived(JSON.stringify(this.#looks));

	/** The frame's baked image, if it's ready with its current look. */
	get(frameIndex: number): HTMLCanvasElement | null {
		const entry = this.#entries.get(frameIndex);
		return entry?.key === this.#key(this.#layers(frameIndex)) ? entry.canvas : null;
	}

	/**
	 * Bakes the frames whose image is missing or has another look, one per
	 * idle moment, until the signal aborts or the memory is used up.
	 */
	prepare(frameIndexes: number[], signal: AbortSignal) {
		const { width, height } = svgState.svgViewBox;
		const [w, h] = snapshotSize(width, height);
		const size = bytesOf({ width: w, height: h });
		const budget = this.maxBytes.current;
		const shown = new Set(frameIndexes);
		const jobs = frameIndexes.map((frameIndex) => {
			const layers = this.#layers(frameIndex);
			return { frameIndex, layers, key: this.#key(layers) };
		});

		const next = () => {
			if (signal.aborted) return;
			const job = jobs.find(
				({ frameIndex, key }) =>
					this.#entries.get(frameIndex)?.key !== key && !this.#failed.has(key)
			);
			if (!job) return;

			this.#drop(job.frameIndex);
			this.#evict(budget - size, shown);
			if (this.totalBytes + size > budget) return;

			this.#bake(job.layers, width, height)
				.then((canvas) => {
					if (signal.aborted) return;
					if (canvas) this.#store(job.frameIndex, job.key, canvas);
					else this.#failed.add(job.key);
				})
				// Without a bake the turn shows the svg image instead
				.catch(() => this.#failed.add(job.key))
				.finally(() => whenIdle(next));
		};
		whenIdle(next);
	}

	clear() {
		this.#entries.clear();
		this.#failed.clear();
		this.totalBytes = 0;
	}

	/** A frame's channels as its image tile draws them. */
	#layers(frameIndex: number): Layer[] {
		return this.#looks.flatMap((look, channelIndex) => {
			const imageIndex = look && projectState.imageIndex(frameIndex, channelIndex);
			return look && imageIndex !== null ? [{ imageIndex, ...look }] : [];
		});
	}

	/** Tells the image of these layers from any other. */
	#key(layers: Layer[]): string {
		return [this.#lookKey, ...layers.map(({ imageIndex }) => imageIndex)].join('\n');
	}

	async #bake(layers: Layer[], width: number, height: number) {
		// Decoded from the files, so even a cloud frame's pixels stay readable
		const images = await Promise.all(
			layers.map(async ({ imageIndex }) =>
				createImageBitmap(await frameCache.load(imageIndex))
			)
		);
		try {
			const drawn = layers.map((layer, i) => ({ ...layer, image: images[i] }));
			return bakeImage(drawn, width, height);
		} finally {
			for (const image of images) image.close();
		}
	}

	#store(frameIndex: number, key: string, canvas: HTMLCanvasElement) {
		this.#drop(frameIndex);
		this.#entries.set(frameIndex, { key, canvas });
		this.totalBytes += bytesOf(canvas);
	}

	#drop(frameIndex: number) {
		const entry = this.#entries.get(frameIndex);
		if (!entry) return;
		this.#entries.delete(frameIndex);
		this.totalBytes -= bytesOf(entry.canvas);
	}

	/** Drops the oldest frames until the rest fit into `limit` bytes, sparing the ones to keep. */
	#evict(limit: number, keep?: Set<number>) {
		for (const frameIndex of this.#entries.keys()) {
			if (this.totalBytes <= limit) break;
			if (!keep?.has(frameIndex)) this.#drop(frameIndex);
		}
	}
}

export const frameSnapshots = new FrameSnapshots();
