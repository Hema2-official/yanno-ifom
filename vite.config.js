import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * Cross-origin isolation, which lets ONNX Runtime run the networks on several threads: on
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
	plugins: [crossOriginIsolation, tailwindcss(), sveltekit()],
	server: {
		port: 5174,
		strictPort: true
	},
	// ONNX Runtime loads its WebAssembly from beside its module, which pre-bundling would move
	optimizeDeps: { exclude: ['onnxruntime-web'] },
	worker: { format: 'es' }
});
