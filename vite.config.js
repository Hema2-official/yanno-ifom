import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig } from 'vite';

const pages = 'build';
// One page for every path, so any static file server can host the app
const staticAdapter = adapter({ pages, fallback: 'index.html' });

/**
 * Also lists what the service worker keeps: every file of the app, the computing worker's too,
 * which Kit's own lists leave out, but not the models, which a browser keeps once it uses them.
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

/**
 * Cross-origin isolation, which lets ONNX Runtime run the models on several threads: on
 * every response, the pages SvelteKit serves included.
 * @type {import('vite').Plugin}
 */
const crossOriginIsolation = {
	name: 'cross-origin-isolation',
	configureServer(server) {
		server.middlewares.use(isolate);
	},
	configurePreviewServer(server) {
		server.middlewares.use(isolate);
	}
};

/** @type {import('vite').Connect.NextHandleFunction} */
function isolate(_, response, next) {
	response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
	response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
	next();
}

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		crossOriginIsolation,
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: offlineAdapter,
			// For a host that serves it below its root, as BASE_PATH=/ifom
			paths: { base: /** @type {'' | `/${string}`} */ (process.env.BASE_PATH ?? '') },
			// The root layout does, outside development
			serviceWorker: { register: false },
			alias: {
				$lib: './src/lib'
			}
		})
	],
	server: {
		port: 5174,
		strictPort: true
	},
	// ONNX Runtime loads its WebAssembly from beside its module, which pre-bundling would move
	optimizeDeps: { exclude: ['onnxruntime-web'] },
	worker: { format: 'es' }
});
