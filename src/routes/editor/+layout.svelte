<script lang="ts">
	import { onMount } from 'svelte';
	import { _updateModifierKeys } from '$lib/stores/input';
	import { isSvgShown } from '$lib/stores/svg';
	import { redoChange, saveToServer, undoChange } from '$lib/stores/data';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	onMount(() => {
		// Update modifier keys
		document.body.addEventListener('keydown', _updateModifierKeys);
		document.body.addEventListener('keyup', _updateModifierKeys);
		document.body.addEventListener('mouseenter', _updateModifierKeys);

		// Global shortcuts
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
				$isSvgShown = false;
			}
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();

				// Show annotation
				$isSvgShown = true;
			}
		};

		document.body.addEventListener('keydown', handleKeyDown);
		document.body.addEventListener('keyup', handleKeyUp);

		return () => {
			document.body.removeEventListener('keydown', _updateModifierKeys);
			document.body.removeEventListener('keyup', _updateModifierKeys);
			document.body.removeEventListener('mouseenter', _updateModifierKeys);
			document.body.removeEventListener('keydown', handleKeyDown);
			document.body.removeEventListener('keyup', handleKeyUp);
		};
	});
</script>

<div class="flex flex-col items-center justify-start h-screen w-full">
	{@render children()}
</div>
