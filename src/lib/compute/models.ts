/** The networks of symmetry-tracker-web's tools/export_models.py, as the app serves them from static/models. */
export type ModelManifest = {
	source: { weights: string; tracker: string };
	models: Record<string, { bytes: number; sha256: string }>;
};

const CACHE_NAME = 'models';

export async function loadManifest(base: string): Promise<ModelManifest> {
	const missing = `The networks are missing from ${base}: copy symmetry-tracker-web's models there`;
	const response = await fetch(new URL('manifest.json', base), { cache: 'no-cache' });
	if (!response.ok) throw new Error(missing);
	// A host that answers every path with the app's page sends no JSON
	return (await response.json().catch(() => Promise.reject(new Error(missing)))) as ModelManifest;
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
	// Only secure pages have the cache, and private windows may refuse it
	const cache =
		typeof caches === 'undefined' ? null : await caches.open(CACHE_NAME).catch(() => null);
	const cached = await cache?.match(key).catch(() => undefined);
	if (cached) return new Uint8Array(await cached.arrayBuffer());

	// Past the HTTP cache: it could hold an earlier export of the same name, and a second copy
	const response = await fetch(url, { cache: 'no-store' });
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
