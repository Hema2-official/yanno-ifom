<script lang="ts">
	import Spinner from '$lib/UI/Common/Spinner.svelte';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import logout from '$lib/api/auth/logout';

	onMount(() => {
		setTimeout(() => {
			logout()
				.then(() => {
					console.log('Logged out');
				})
				.catch((error) => {
					console.error(error);
				})
				.finally(() => {
					setTimeout(() => {
						goto('/login');
					}, 100);
				});
		}, 2000);
	});
</script>

<div class="flex flex-col items-center justify-center w-full gap-1.5">
	<p class="text-[28px]">Logging you out...</p>
	<Spinner />
</div>
