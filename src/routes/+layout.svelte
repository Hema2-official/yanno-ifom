<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { Snippet } from 'svelte';
	import { accountState } from '$lib/states/AccountState.svelte';
	import { registerFrameServiceWorker } from '$lib/workers/frameServiceWorker';
	import { Toaster } from '$lib/components/ui/sonner';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
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

	onMount(() => {
		registerFrameServiceWorker();
		accountState.refresh();
	});

	$effect(() => {
		if (accountState.currentAccount === undefined) return;

		const path = window.location.pathname;
		const isAuthenticating = path === '/login' || path === '/register';

		if (accountState.currentAccount === null) {
			if (isAuthenticating) return;
			if (path === '/logout') {
				goto(resolve('/login'));
			} else {
				const ref = path + window.location.search + window.location.hash;
				goto(resolve(`/login?redirect=${encodeURIComponent(ref)}`));
			}
		} else {
			if (!isAuthenticating) return;
			const searchParams = new URLSearchParams(window.location.search);
			const redirect = decodeURIComponent(searchParams.get('redirect') || '');
			goto(resolve((redirect as Pathname) || '/'));
		}
	});
</script>

<ModeWatcher lightClassNames={['light']} />
<Toaster />

<main class="flex h-screen w-full">
	{@render children()}
</main>
