/** The networks of symmetry-tracker-web's tools/export_models.py, as the app serves them from static/models. */
export type ModelManifest = {
	source: { weights: string; tracker: string };
	models: Record<string, { bytes: number; sha256: string }>;
};

const CACHE_NAME = 'models';

const openCache = async () =>
	typeof caches === 'undefined' ? null : await caches.open(CACHE_NAME).catch(() => null);

/** The networks' manifest, or the last one read while the server is down. */
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
			? `The networks are missing from ${base}: copy symmetry-tracker-web's models there`
			: "The server can't be reached, and this browser hasn't kept the networks yet"
	);
}

/**
 * A network's bytes, downloaded once and then kept in the browser's cache under its checksum,
 * so networks exported anew replace the old ones.
 */
export async function loadModel(
	base: string,
	manifest: ModelManifest,
	name: string,
	onProgress: (loaded: number, total: number) => void
): Promise<Uint8Array> {
	const entry = manifest.models[name];
	if (!entry) throw new Error(`The networks' manifest lists no ${name}`);
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
