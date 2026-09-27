<script lang="ts">
	import Spinner from '$lib/ui/common/Spinner.svelte';
	import { onMount } from 'svelte';
	import { logout } from '$lib/api/auth';
	import { accountState } from '$lib/states/AccountState.svelte';

	onMount(() => {
		setTimeout(() => {
			logout()
				.then(() => {
					console.log('Logged out');
				})
				.catch((error) => {
					console.error(error);
				})
				// The root layout redirects once the account is known
				.finally(() => accountState.refresh());
		}, 1000);
	});
</script>

<div class="flex w-full flex-col items-center justify-center gap-1.5">
	<p class="text-[28px]">Logging you out...</p>
	<Spinner />
</div>
