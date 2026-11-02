/** The models exported by symmetry-tracker-web and tools/export_trackers.py, as the app serves them from static/models. */
export type ModelManifest = {
	models: Record<string, { bytes: number; sha256: string }>;
};

type TrackingModel = {
	file: string;
	timeKernelSize: number;
	label: string;
	/** Reads a window around each cell, not the whole frame. */
	crop?: boolean;
};

const tracker = (
	backbone: number,
	timeKernelSize: number,
	file = `track_RN${backbone}_FBtr${timeKernelSize}.onnx`
): TrackingModel => ({
	file,
	timeKernelSize,
	label: `ResNet-${backbone}, ${timeKernelSize} frame${timeKernelSize > 1 ? 's' : ''} each way`
});

/** The tracking models on offer, the one validated against the Python reference first. */
export const trackingModels: TrackingModel[] = [
	tracker(50, 7, 'track.onnx'),
	{
		file: 'crop_tracker.onnx',
		timeKernelSize: 7,
		label: 'Crop tracker, 7 frames each way (fast)',
		crop: true
	},
	...[18, 34, 101, 152].map((backbone) => tracker(backbone, 7)),
	...[1, 2, 3, 4, 5, 6, 8, 9].map((timeKernelSize) => tracker(50, timeKernelSize))
];

const CACHE_NAME = 'models';

const openCache = async () =>
	typeof caches === 'undefined' ? null : await caches.open(CACHE_NAME).catch(() => null);

/** The models' manifest, or the last one read while the server is down. */
export async function loadManifest(base: string): Promise<ModelManifest> {
	const url = new URL('manifest.json', base);
	const cache = await openCache();
	const response = await fetch(url, { cache: 'no-cache' }).catch(() => null);
	// A host that answers every path with the app's page sends no JSON
	const manifest = response?.ok
		? ((await response
				.clone()
				.json()
				.catch(() => null)) as ModelManifest | null)
		: null;
	if (manifest) {
		await cache?.put(url, response!).catch(() => {});
		return manifest;
	}

	const kept = await cache?.match(url).catch(() => undefined);
	if (kept) return (await kept.json()) as ModelManifest;
	throw new Error(
		response
			? `The models are missing from ${base}: copy symmetry-tracker-web's models there`
			: "The server can't be reached, and this browser hasn't kept the models yet"
	);
}

/**
 * A model's bytes, downloaded once and then kept in the browser's cache under its checksum,
 * so models exported anew replace the old ones.
 */
export async function loadModel(
	base: string,
	manifest: ModelManifest,
	name: string,
	onProgress: (loaded: number, total: number) => void
): Promise<Uint8Array> {
	const entry = manifest.models[name];
	if (!entry) throw new Error(`The models' manifest lists no ${name}`);
	const url = new URL(name, base);
	const key = `${url.href}?sha256=${entry.sha256}`;
	const cache = await openCache();
	const cached = await cache?.match(key).catch(() => undefined);
	if (cached) return new Uint8Array(await cached.arrayBuffer());

	// Past the HTTP cache: it could hold an earlier export of the same name, and a second copy
	const response = await fetch(url, { cache: 'no-store' }).catch(() => {
		throw new Error(`Couldn't download ${name}: the server can't be reached`);
	});
	if (!response.ok || !response.body)
		throw new Error(`Couldn't download ${name}: HTTP ${response.status}`);
	const bytes = new Uint8Array(entry.bytes);
	let loaded = 0;
	const reader = response.body.getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (loaded + value.length > bytes.length)
			throw new Error(`${name} is larger than the manifest says`);
		bytes.set(value, loaded);
		loaded += value.length;
		onProgress(loaded, bytes.length);
	}
	if (loaded !== bytes.length) throw new Error(`${name} is smaller than the manifest says`);
	if (crypto.subtle) {
		const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
		const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
		if (hex !== entry.sha256) throw new Error(`${name} doesn't match the manifest's checksum`);
	}

	try {
		for (const request of (await cache?.keys()) ?? []) {
			if (request.url.startsWith(`${url.href}?`)) await cache!.delete(request);
		}
		await cache?.put(key, new Response(bytes));
	} catch {
		// Without room it's downloaded again next time
	}
	return bytes;
}
