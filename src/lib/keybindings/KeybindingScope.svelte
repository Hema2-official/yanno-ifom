<!-- The scope's actions apply while this is mounted -->
<script lang="ts">
	import { keybindings } from '$lib/states/KeybindingState.svelte';
	import type { ActionScope } from './actions';

	let { scope }: { scope: ActionScope } = $props();

	$effect(() => keybindings.activate(scope));
</script>
