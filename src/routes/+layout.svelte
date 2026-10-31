<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { Snippet } from 'svelte';
	import { accountState } from '$lib/states/AccountState.svelte';
	import KeybindingListener from '$lib/keybindings/KeybindingListener.svelte';
	import { Toaster } from '$lib/components/ui/sonner';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import SettingsDialog from '$lib/ui/settings/SettingsDialog.svelte';
	import { resolve } from '$app/paths';
	import type { RouteIdWithSearchOrHash } from '$app/types';
	import { ModeWatcher } from 'mode-watcher';

	import '../app.css';

	let { children }: { children: Snippet } = $props();

	onMount(() => {
		accountState.refresh();
	});

	$effect(() => {
		if (accountState.currentAccount === undefined) return;

		const path = window.location.pathname;
		const search = new URLSearchParams(window.location.search);
		const isAuthenticating = path === '/login' || path === '/register';

		// Guests can list and edit local projects, which live in this browser
		const isPublic =
			path === '/' ||
			path === '/projects' ||
			(path === '/editor' && search.get('project')?.startsWith('local_'));

		if (accountState.currentAccount === null) {
			if (isAuthenticating || isPublic) return;
			if (path === '/logout') {
				goto(resolve('login'));
			} else {
				const ref = path + window.location.search + window.location.hash;
				goto(resolve(`login?redirect=${encodeURIComponent(ref)}`));
			}
		} else {
			if (!isAuthenticating) return;
			const searchParams = new URLSearchParams(window.location.search);
			const redirect = decodeURIComponent(searchParams.get('redirect') || '');
			// A redirect to no route rejects
			goto(resolve((redirect as RouteIdWithSearchOrHash) || '/')).catch(() =>
				goto(resolve('/'))
			);
		}
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
