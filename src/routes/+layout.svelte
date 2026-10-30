<script lang="ts">
	import type { Snippet } from 'svelte';
	import KeybindingListener from '$lib/keybindings/KeybindingListener.svelte';
	import { Toaster } from '$lib/components/ui/sonner';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import SettingsDialog from '$lib/ui/settings/SettingsDialog.svelte';
	import { ModeWatcher } from 'mode-watcher';

	import { addMessages, init } from 'svelte-i18n';
	import en from '$lib/lang/en.json';
	// import hu from "$lib/lang/hu.json";

	import '../app.css';

	let { children }: { children: Snippet } = $props();

	addMessages('en', en);
	// addMessages("hu", hu);

	init({
		fallbackLocale: 'en',
		initialLocale: 'en'
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
