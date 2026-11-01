import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter(),
			alias: {
				$lib: './src/lib'
			},
			version: { name: buildVersion() }
		})
	],
	server: {
		port: 5174
	}
});

/** The commit and the build's time, as builds of a commit can differ by uncommitted work. */
function buildVersion() {
	const time = new Date().toISOString().slice(0, 19).replace('T', ' ');
	try {
		const commit = execSync('git describe --always --dirty', {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		});
		return `${commit.trim()} ${time} UTC`;
	} catch {
		// Built from a copy of the sources, without their history
		return `${time} UTC`;
	}
}
