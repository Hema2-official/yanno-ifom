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

<div class="logout-container">
	<p>Logging you out...</p>
	<Spinner />
</div>

<style lang="scss">
	.logout-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 100%;
		gap: 6px;

		p {
			font-size: 28px;
		}
	}
</style>
