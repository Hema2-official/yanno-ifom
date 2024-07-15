<script lang="ts">
	import TextBox from '$lib/UI/Common/TextBox.svelte';
	import ProceedButton from '$lib/UI/Common/ProceedButton.svelte';
	import login from '$lib/api/auth/login';
	import { goto } from '$app/navigation';
	import { isAxiosError, type AxiosError } from 'axios';
	import type { APIError, CredentialsError } from '$lib/types/api.type';

	let proceedButtonComponent: ProceedButton;

	let email = '';
	let password = '';

	let email_field_message: string | undefined;
	let password_field_message: string | undefined;
	let other_error_message: string;

	const redirect = new URLSearchParams(window.location.search).get('redirect');

	const handleSubmit = () => {
		// Reset error messages
		email_field_message = '';
		password_field_message = '';

		proceedButtonComponent.$set({ disabled: true, loading: true });
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
				proceedButtonComponent.$set({ disabled: false, loading: false });
			});
	};
</script>

<form class="login-form" on:submit|preventDefault={handleSubmit}>
	{#if other_error_message}
		<p class="error-message">{other_error_message}</p>
	{/if}
	<TextBox bind:value={email} type="email">Email</TextBox>
	{#if email_field_message}
		<p class="error-message">{email_field_message}</p>
	{/if}
	<TextBox bind:value={password} type="password">Password</TextBox>
	{#if password_field_message}
		<p class="error-message">{password_field_message}</p>
	{/if}
	<ProceedButton bind:this={proceedButtonComponent} onClick={() => null}>Log in</ProceedButton>
</form>

<style lang="scss">
	.login-form {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 200px;
		padding: 16px 12px;

		.error-message {
			margin: 0;
			font-size: 12px;
			color: red;
			padding: 0 4px 4px 4px;
			width: 100%;
		}
	}
</style>
