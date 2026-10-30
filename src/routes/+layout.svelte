<script lang="ts">
	import type { Snippet } from 'svelte';
	import KeybindingListener from '$lib/keybindings/KeybindingListener.svelte';
	import { Toaster } from '$lib/components/ui/sonner';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import SettingsDialog from '$lib/ui/settings/SettingsDialog.svelte';
	import { ModeWatcher } from 'mode-watcher';

	import '../app.css';

	let { children }: { children: Snippet } = $props();
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
