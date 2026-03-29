<script lang="ts">
	import { onMount } from 'svelte';
	import getMe from '$lib/api/users/getMe';
	import { goto } from '$app/navigation';
	import type { Snippet } from 'svelte';

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

	console.log(window.location);
	let isLoggedIn = false;
	const isAuthenticating =
		window.location.pathname === '/login' || window.location.pathname === '/register';

	onMount(() => {
		getMe()
			.then((me) => {
				if (me.id) isLoggedIn = true;
			})
			.catch(() => {})
			.finally(() => {
				if (!isLoggedIn && !isAuthenticating) {
					if (window.location.pathname === '/logout') goto('/login');
					else goto('/login?redirect=' + window.location.pathname);
				} else if (isLoggedIn && isAuthenticating) {
					const redirect = new URLSearchParams(window.location.search).get('redirect');
					if (redirect) goto(redirect);
					else goto('/');
				}
			});
	});
</script>

<main class="flex h-screen w-full">
	{@render children()}
</main>
