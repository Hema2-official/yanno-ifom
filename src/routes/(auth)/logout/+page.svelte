<script lang="ts">
	import Spinner from '$lib/ui/common/Spinner.svelte';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { logout } from '$lib/api/auth';
	import { resolve } from '$app/paths';

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
						goto(resolve('/login'));
					}, 100);
				});
		}, 2000);
	});
</script>

<div class="flex w-full flex-col items-center justify-center gap-1.5">
	<p class="text-[28px]">Logging you out...</p>
	<Spinner />
</div>
