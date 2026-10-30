import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),

	kit: {
		// One page for every path, so any static file server can host the app
		adapter: adapter({ fallback: 'index.html' }),
		// For a host that serves it below its root, as BASE_PATH=/ifom
		paths: { base: process.env.BASE_PATH ?? '' },
		alias: {
			$lib: './src/lib'
		}
	}
};
