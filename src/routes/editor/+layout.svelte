<script lang="ts">
	import { onMount } from 'svelte';
	import { svgState } from '$lib/states/svg.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	onMount(() => {
		// Global shortcuts
		// TODO: centralize this and provide configuration
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 's' && e.ctrlKey) {
				e.preventDefault();
				e.stopPropagation();

				// Save
				console.log('Save');
				saveToServer();
			}

			if (e.key === 'z' && e.ctrlKey) {
				e.preventDefault();
				e.stopPropagation();

				// Undo
				console.log('Undo');
				undoChange();
			}

			if (e.key === 'y' && e.ctrlKey) {
				e.preventDefault();
				e.stopPropagation();

				// Redo
				console.log('Redo');
				redoChange();
			}

			// hold space to hide annotation
			if (e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();

				// Hide annotation
				svgState.isSvgShown = false;
			}
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();

				// Show annotation
				svgState.isSvgShown = true;
			}
		};

		document.body.addEventListener('keydown', handleKeyDown);
		document.body.addEventListener('keyup', handleKeyUp);

		return () => {
			document.body.removeEventListener('keydown', handleKeyDown);
			document.body.removeEventListener('keyup', handleKeyUp);
		};
	});
</script>

<div class="flex flex-col items-center justify-start h-screen w-full">
	{@render children()}
</div>
