<script lang="ts">
	import TextBox from '$lib/ui/common/TextBox.svelte';
	import { Button } from '$lib/components/ui/button';
	import { login } from '$lib/api/auth';
	import { goto } from '$app/navigation';
	import type { APIError, CredentialsError } from '$lib/types/api.type';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';

	let email = $state('');
	let password = $state('');

	let email_field_message: string | undefined = $state(undefined);
	let password_field_message: string | undefined = $state(undefined);
	let other_error_message = $state('');

	let isLoading = $state(false);

	const redirect = new URLSearchParams(window.location.search).get('redirect');

	const handleSubmit = () => {
		if (isLoading) return;

		// Reset error messages
		email_field_message = '';
		password_field_message = '';

		isLoading = true;
		login(email, password)
			.then((response) => {
				console.log('Logged in as', response.account_id);
				if (redirect) {
					goto(resolve(redirect as Pathname));
				} else {
					goto(resolve('/'));
				}
			})
			.catch((error: Error | APIError | CredentialsError) => {
				if (typeof error === 'object' && 'detail' in error) {
					if (typeof error.detail === 'string') {
						other_error_message = error.detail;
					} else if (error.detail && typeof error.detail === 'object') {
						email_field_message = error.detail.email_field_message;
						password_field_message = error.detail.password_field_message;
					}
				} else {
					alert('Login failed: ' + error);
				}
			})
			.finally(() => {
				isLoading = false;
			});
	};
</script>

<form
	class="flex flex-col items-center justify-center w-[200px] px-3 py-4"
	onsubmit={(e) => {
		e.preventDefault();
		handleSubmit();
	}}
>
	{#if other_error_message}
		<p class="m-0 text-xs text-red-500 px-1 pb-1 w-full">{other_error_message}</p>
	{/if}
	<TextBox bind:value={email} type="email">Email</TextBox>
	{#if email_field_message}
		<p class="m-0 text-xs text-red-500 px-1 pb-1 w-full">{email_field_message}</p>
	{/if}
	<TextBox bind:value={password} type="password">Password</TextBox>
	{#if password_field_message}
		<p class="m-0 text-xs text-red-500 px-1 pb-1 w-full">{password_field_message}</p>
	{/if}
	<Button variant="outline" class="mt-4" type="submit" disabled={isLoading}>Log in</Button>
</form>
