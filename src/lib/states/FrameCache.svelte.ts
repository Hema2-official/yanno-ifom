import { watch } from 'runed';
import { projectState } from './ProjectState.svelte';
import { SettingState } from './SettingState.svelte';
import { videoDisplayState } from './VideoDisplayState.svelte';

type CacheEntry = {
	blob: Blob;
	objectUrl: string;
};

const MAX_PARALLEL_FETCHES = 4;

/**
 * In-memory LRU cache of frame images, keyed by their network URL (which is
 * unique across projects and frame sources). Cached frames are exposed as
 * object URLs backed by the downloaded WebP blobs, so revisiting a frame
 * never touches the network or the service worker again.
 */
class FrameCache {
	/** Maximum memory the cached frames may occupy, in bytes. */
	maxBytes = new SettingState('maxBytes', 256 * 1024 * 1024, { local: true });

	/** How many frames around the displayed window get prefetched. */
	prefetchRadius = new SettingState('prefetchRadius', 20, { local: true });

	/** Current memory usage of the cache, in bytes. */
	totalBytes = $state(0);

	/** Cache entries; insertion order doubles as LRU order. */
	#entries = new Map<string, CacheEntry>();
	#inflight = new Map<string, Promise<Blob>>();
	#failed = new Set<string>();
	#queue: string[] = [];
	#activeFetches = 0;

	constructor() {
		// A smaller budget drops frames at once
		$effect.root(() => {
			watch([() => this.maxBytes.current], () => this.#evict(), { lazy: true });
		});
	}

	/**
	 * Returns the in-memory object URL of a frame, falling back to the
	 * network URL (and caching the frame in the background) on a miss.
	 */
	getUrl(url: string): string {
		const entry = this.#entries.get(url);
		if (entry) {
			this.#touch(url);
			return entry.objectUrl;
		}
		this.#enqueueFront(url);
		return url;
	}

	load(url: string): Promise<Blob> {
		const entry = this.#entries.get(url);
		if (entry) {
			this.#touch(url);
			return Promise.resolve(entry.blob);
		}
		return this.#inflight.get(url) ?? this.#fetch(url);
	}

	/** Replaces the prefetch queue based on the current needs */
	prefetchWindow(start: number, count: number) {
		const frameCount = projectState.frameCount;
		if (frameCount === 0) return;

		const channelVisibility = videoDisplayState.channels.map((channel) => channel.visible);
		const urls: string[] = [];
		const addFrame = (frameIndex: number, visibleChannelsOnly: boolean) => {
			if (frameIndex < 0 || frameIndex >= frameCount) return;
			channelVisibility.forEach((visible, channelIndex) => {
				if (visibleChannelsOnly && !visible) return;
				const url = projectState.getChannelFrameUrl(frameIndex, channelIndex);
				if (url) urls.push(url);
			});
		};

		for (let i = 0; i < count; i++) addFrame(start + i, false);
		for (let distance = 1; distance <= this.prefetchRadius.current; distance++) {
			addFrame(start + count - 1 + distance, true);
			addFrame(start - distance, true);
		}

		this.#queue = urls.filter((url) => this.#isFetchable(url));
		this.#pump();
	}

	clear() {
		for (const entry of this.#entries.values()) URL.revokeObjectURL(entry.objectUrl);
		this.#entries.clear();
		this.#failed.clear();
		this.#queue = [];
		this.totalBytes = 0;
	}

	#isFetchable(url: string): boolean {
		return !this.#entries.has(url) && !this.#inflight.has(url) && !this.#failed.has(url);
	}

	#enqueueFront(url: string) {
		if (!this.#isFetchable(url)) return;
		if (this.#queue[0] === url) return;
		this.#queue = [url, ...this.#queue.filter((queued) => queued !== url)];
		this.#pump();
	}

	#pump() {
		while (this.#activeFetches < MAX_PARALLEL_FETCHES && this.#queue.length > 0) {
			const url = this.#queue.shift()!;
			if (this.#isFetchable(url)) void this.#fetch(url);
		}
	}

	#fetch(url: string): Promise<Blob> {
		const loading = fetch(url, { credentials: 'include' }).then(async (response) => {
			if (!response.ok) throw new Error(`Fetching frame failed: ${response.status}`);
			const blob = await response.blob();
			this.#insert(url, blob);
			return blob;
		});
		this.#inflight.set(url, loading);
		this.#activeFetches++;
		loading
			.then(
				() => this.#failed.delete(url),
				// The display still shows the frame through its network URL, clear() forgets the failure
				() => this.#failed.add(url)
			)
			.finally(() => {
				this.#inflight.delete(url);
				this.#activeFetches--;
				this.#pump();
			});
		return loading;
	}

	#insert(url: string, blob: Blob) {
		const objectUrl = URL.createObjectURL(blob);
		this.#entries.set(url, { blob, objectUrl });
		this.totalBytes += blob.size;
		this.#evict();

		// Warm the browser's decoded-image cache, so the frame's first
		// display doesn't have to decode the WebP during paint
		const image = new Image();
		image.src = objectUrl;
		image.decode().catch(() => {});
	}

	/** Moves an entry to the back of the LRU order. */
	#touch(url: string) {
		const entry = this.#entries.get(url);
		if (!entry) return;
		this.#entries.delete(url);
		this.#entries.set(url, entry);
	}

	/** Drops the least recently used entries until the cache fits the budget. */
	#evict() {
		for (const [url, entry] of this.#entries) {
			if (this.totalBytes <= this.maxBytes.current) break;
			URL.revokeObjectURL(entry.objectUrl);
			this.#entries.delete(url);
			this.totalBytes -= entry.blob.size;
		}
	}
}

export const frameCache = new FrameCache();
