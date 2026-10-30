import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapter from '@sveltejs/adapter-static';
import { readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const pages = 'build';
// One page for every path, so any static file server can host the app
const staticAdapter = adapter({ pages, fallback: 'index.html' });

/**
 * Also lists what the service worker keeps: every file of the app, the computing worker's too,
 * which `$service-worker` leaves out, but not the networks, which a browser keeps once it uses them.
 * @type {import('@sveltejs/kit').Adapter}
 */
const offlineAdapter = {
	...staticAdapter,
	async adapt(builder) {
		await staticAdapter.adapt(builder);
		const files = readdirSync(pages, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) =>
				relative(pages, join(entry.parentPath, entry.name)).split(sep).join('/')
			)
			.filter((file) => !file.startsWith('models/') && file !== 'service-worker.js');
		writeFileSync(join(pages, 'precache.json'), JSON.stringify(files));
	}
};

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),

	kit: {
		adapter: offlineAdapter,
		// For a host that serves it below its root, as BASE_PATH=/ifom
		paths: { base: process.env.BASE_PATH ?? '' },
		// The root layout does, outside development
		serviceWorker: { register: false },
		alias: {
			$lib: './src/lib'
		}
	}
};
