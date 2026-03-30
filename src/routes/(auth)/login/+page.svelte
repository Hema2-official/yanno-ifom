<script lang="ts">
	import TextBox from '$lib/UI/Common/TextBox.svelte';
	import { Button } from '$lib/components/ui/button';
	import login from '$lib/api/auth/login';
	import { goto } from '$app/navigation';
	import { isAxiosError, type AxiosError } from 'axios';
	import type { APIError, CredentialsError } from '$lib/types/api.type';

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
					goto(redirect);
				} else {
					goto('/');
				}
			})
			.catch((error) => {
				if (isAxiosError(error)) {
					const axiosError = error as AxiosError<APIError | CredentialsError>;
					const detail = axiosError.response?.data.detail;
					if (typeof detail === 'string') {
						other_error_message = detail;
					} else if (detail) {
						email_field_message = detail.email_field_message;
						password_field_message = detail.password_field_message;
					}
				} else {
					alert('Login failed (out-of-axios): ' + error);
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
