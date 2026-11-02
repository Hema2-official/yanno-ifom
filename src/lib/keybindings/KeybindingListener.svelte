<!-- Feeds the window's key events to the keybindings; mounted once, in the root layout -->
<script lang="ts">
	import { keybindings } from '$lib/states/KeybindingState.svelte';
</script>

<svelte:window
	onkeydown={keybindings.handleKeyDown}
	onkeyup={keybindings.handleKeyUp}
	onblur={keybindings.releaseAll}
/>
<svelte:document
	onvisibilitychange={() => {
		if (document.hidden) keybindings.releaseAll();
	}}
/>
