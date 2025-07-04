<script lang="ts">
	import { onMount } from 'svelte';
	import getMe from '$lib/api/users/getMe';
	import { goto } from '$app/navigation';

	import { addMessages, init } from 'svelte-i18n';
	import en from '$lib/lang/en.json';
	// import hu from "$lib/lang/hu.json";

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
			.catch(() => null)
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

<main class="root-container">
	<slot />
</main>

<style lang="scss">
	.root-container {
		display: flex;
		height: 100vh;
		width: 100%;
	}
</style>
