import { watch } from 'runed';
import { SettingState } from './SettingState.svelte';

type CacheEntry = {
	objectUrl: string;
	size: number;
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
	#inflight = new Set<string>();
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

	/**
	 * Replaces the prefetch queue with the given URLs (most important first).
	 */
	prefetch(urls: string[]) {
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
			this.#fetch(this.#queue.shift()!);
		}
	}

	#fetch(url: string) {
		if (!this.#isFetchable(url)) return;
		this.#inflight.add(url);
		this.#activeFetches++;
		fetch(url, { credentials: 'include' })
			.then(async (response) => {
				if (!response.ok) throw new Error(`Fetching frame failed: ${response.status}`);
				this.#insert(url, await response.blob());
			})
			.catch(() => {
				// The display still shows the frame through its network URL;
				// clear() forgets the failure
				this.#failed.add(url);
			})
			.finally(() => {
				this.#inflight.delete(url);
				this.#activeFetches--;
				this.#pump();
			});
	}

	#insert(url: string, blob: Blob) {
		const objectUrl = URL.createObjectURL(blob);
		this.#entries.set(url, { objectUrl, size: blob.size });
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
			this.totalBytes -= entry.size;
		}
	}
}

export const frameCache = new FrameCache();
