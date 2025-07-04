import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib/')
		}
	},
	css: {
		preprocessorOptions: {
			// if using SCSS
			scss: {
				additionalData: `
				@import '$lib/scss/theme';
                @import '$lib/scss/breakpoints';
            `
			}
		}
	},
	server: {
		port: 5174
	}
});
