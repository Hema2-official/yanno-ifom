import { watch } from 'runed';
import { SvelteMap } from 'svelte/reactivity';
import { projectState } from './ProjectState.svelte';
import { SettingState } from './SettingState.svelte';
import { videoDisplayState } from './VideoDisplayState.svelte';

type ImageReader = (imageIndex: number, signal?: AbortSignal) => Promise<Blob>;

const MAX_PARALLEL_READS = 4;

/**
 * In-memory LRU cache of the open project's frame images, by their index in the
 * video. Cached images are exposed as object URLs backed by the WebP blobs, so
 * revisiting a frame never reads it again.
 */
class FrameCache {
	/** Maximum memory the cached frames may occupy, in bytes. */
	maxBytes = new SettingState('maxBytes', 256 * 1024 * 1024);

	/** How many frames around the displayed window get prefetched. */
	prefetchRadius = new SettingState('prefetchRadius', 20);

	/** Current memory usage of the cache, in bytes. */
	totalBytes = $state(0);

	#source: { id: string; read: ImageReader } | null = null;
	/** Insertion order doubles as LRU order. */
	#blobs = new Map<number, Blob>();
	/** Reactive, so a tile draws again once its image lands. */
	#urls = new SvelteMap<number, string>();
	#inflight = new Map<number, Promise<Blob>>();
	#queue: number[] = [];
	#activeReads = 0;

	constructor() {
		// A smaller budget drops frames at once
		$effect.root(() => {
			watch([() => this.maxBytes.current], () => this.#evict(), { lazy: true });
		});
	}

	/** Reads another project's images from now on; the same project keeps its cache. */
	open(id: string, read: ImageReader) {
		if (this.#source?.id !== id) this.clear();
		this.#source = { id, read };
	}

	/** The image's object URL, once it's read. */
	url(imageIndex: number): string | null {
		return this.#urls.get(imageIndex) ?? null;
	}

	load(imageIndex: number): Promise<Blob> {
		const blob = this.#blobs.get(imageIndex);
		if (blob) {
			this.#touch(imageIndex);
			return Promise.resolve(blob);
		}
		return this.#inflight.get(imageIndex) ?? this.#read(imageIndex);
	}

	/** Like `load`, but keeps nothing new, so exports leave the display's images cached. */
	readUncached(imageIndex: number, signal?: AbortSignal): Promise<Blob> {
		const cached = this.#blobs.get(imageIndex) ?? this.#inflight.get(imageIndex);
		if (cached) return Promise.resolve(cached);
		if (!this.#source) return Promise.reject(new Error('No project is open'));
		return this.#source.read(imageIndex, signal);
	}

	/** Replaces the prefetch queue based on the current needs */
	prefetchWindow(start: number, count: number) {
		const channelVisibility = videoDisplayState.channels.map((channel) => channel.visible);
		const images: number[] = [];
		const addFrame = (frameIndex: number, visibleChannelsOnly: boolean) => {
			channelVisibility.forEach((visible, channelIndex) => {
				if (visibleChannelsOnly && !visible) return;
				const imageIndex = projectState.imageIndex(frameIndex, channelIndex);
				if (imageIndex !== null) images.push(imageIndex);
			});
		};

		for (let i = 0; i < count; i++) addFrame(start + i, false);
		for (let distance = 1; distance <= this.prefetchRadius.current; distance++) {
			addFrame(start + count - 1 + distance, true);
			addFrame(start - distance, true);
		}

		// Just used, so eviction takes the ones wanted longest ago
		for (const imageIndex of images.toReversed()) this.#touch(imageIndex);
		this.#queue = images.filter((imageIndex) => this.#isMissing(imageIndex));
		this.#pump();
	}

	clear() {
		for (const url of this.#urls.values()) URL.revokeObjectURL(url);
		this.#blobs.clear();
		this.#urls.clear();
		this.#inflight.clear();
		this.#queue = [];
		this.totalBytes = 0;
	}

	#isMissing(imageIndex: number): boolean {
		return !this.#blobs.has(imageIndex) && !this.#inflight.has(imageIndex);
	}

	#pump() {
		while (this.#activeReads < MAX_PARALLEL_READS && this.#queue.length > 0) {
			const imageIndex = this.#queue.shift()!;
			if (this.#isMissing(imageIndex)) void this.#read(imageIndex);
		}
	}

	#read(imageIndex: number): Promise<Blob> {
		const source = this.#source;
		if (!source) return Promise.reject(new Error('No project is open'));

		const reading = source.read(imageIndex).then((blob) => {
			// Another project may have opened meanwhile
			if (this.#source?.id === source.id) this.#insert(imageIndex, blob);
			return blob;
		});
		this.#inflight.set(imageIndex, reading);
		this.#activeReads++;
		reading
			// A failed image is read again when it's next wanted
			.catch(() => {})
			.finally(() => {
				if (this.#inflight.get(imageIndex) === reading) this.#inflight.delete(imageIndex);
				this.#activeReads--;
				this.#pump();
			});
		return reading;
	}

	#insert(imageIndex: number, blob: Blob) {
		const url = URL.createObjectURL(blob);
		this.#blobs.set(imageIndex, blob);
		this.#urls.set(imageIndex, url);
		this.totalBytes += blob.size;
		this.#evict();

		// Warm the browser's decoded-image cache, so the frame's first
		// display doesn't have to decode the WebP during paint
		const image = new Image();
		image.src = url;
		image.decode().catch(() => {});
	}

	/** Moves an image to the back of the LRU order. */
	#touch(imageIndex: number) {
		const blob = this.#blobs.get(imageIndex);
		if (!blob) return;
		this.#blobs.delete(imageIndex);
		this.#blobs.set(imageIndex, blob);
	}

	/** Drops the least recently used images until the cache fits the budget. */
	#evict() {
		for (const [imageIndex, blob] of this.#blobs) {
			if (this.totalBytes <= this.maxBytes.current) break;
			const url = this.#urls.get(imageIndex);
			if (url) URL.revokeObjectURL(url);
			this.#blobs.delete(imageIndex);
			this.#urls.delete(imageIndex);
			this.totalBytes -= blob.size;
		}
	}
}

export const frameCache = new FrameCache();
