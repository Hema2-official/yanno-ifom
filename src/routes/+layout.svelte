<script lang="ts">
	import { onMount } from 'svelte';
	import { getMe } from '$lib/api/users';
	import { goto } from '$app/navigation';
	import type { Snippet } from 'svelte';
	import { accountState } from '$lib/states/AccountState.svelte';
	import { registerFrameServiceWorker } from '$lib/workers/frameServiceWorker';

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

		getMe()
			.then((me) => {
				accountState.currentAccount = me;
			})
			.catch(() => {
				accountState.currentAccount = null;
			});
	});

	$effect(() => {
		if (accountState.currentAccount === undefined) return;

		const path = window.location.pathname;
		const isAuthenticating = path === '/login' || path === '/register';

		if (accountState.currentAccount === null) {
			if (isAuthenticating) return;
			if (path === '/logout') {
				goto('/login');
			} else {
				const ref = path + window.location.search + window.location.hash;
				goto(`/login?redirect=${encodeURIComponent(ref)}`);
			}
		} else {
			if (!isAuthenticating) return;
			const searchParams = new URLSearchParams(window.location.search);
			const redirect = decodeURIComponent(searchParams.get('redirect') || '');
			goto(redirect || '/');
		}
	});
</script>

<main class="flex h-screen w-full">
	{@render children()}
</main>
