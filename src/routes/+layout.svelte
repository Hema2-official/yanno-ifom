<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { dev } from '$app/env';
	import KeybindingListener from '$lib/keybindings/KeybindingListener.svelte';
	import { Toaster } from '$lib/components/ui/sonner';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import SettingsDialog from '$lib/ui/settings/SettingsDialog.svelte';
	import { keepAppUpdated } from '$lib/utils/updates';
	import { ModeWatcher } from 'mode-watcher';

	import '../app.css';

	let { children }: { children: Snippet } = $props();

	// While developing, the copy it keeps would hide the changes being made
	onMount(() => {
		if (!dev) void keepAppUpdated();
	});
</script>

<ModeWatcher lightClassNames={['light']} />
<KeybindingListener />
<Toaster />
<SettingsDialog />

<Tooltip.Provider delayDuration={300}>
	<main class="flex h-screen w-full">
		{@render children()}
	</main>
</Tooltip.Provider>
