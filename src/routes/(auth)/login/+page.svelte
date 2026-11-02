<script lang="ts">
	import { resolve } from '$app/paths';
	import { LoaderCircleIcon } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Marker from '$lib/components/ui/marker';
	import { login } from '$lib/api/auth';
	import { toastError } from '$lib/api/errors';
	import { accountState } from '$lib/states/AccountState.svelte';
	import type { APIError, CredentialsError } from '$lib/types/api.type';

	const uid = $props.id();

	let email = $state('');
	let password = $state('');
	let emailMessage = $state('');
	let passwordMessage = $state('');
	let message = $state('');
	let busy = $state(false);

	async function onsubmit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;

		emailMessage = passwordMessage = message = '';
		busy = true;
		try {
			await login(email, password);
			// The root layout redirects once the account is known
			await accountState.refresh();
		} catch (error) {
			const detail = (error as Partial<APIError | CredentialsError>).detail;
			if (typeof detail === 'string') message = detail;
			else if (detail) {
				emailMessage = detail.email_field_message ?? '';
				passwordMessage = detail.password_field_message ?? '';
			} else toastError('Login failed', error);
		} finally {
			busy = false;
		}
	}
</script>

<div class="mt-6 flex w-72 flex-col gap-4">
	<form class="flex flex-col gap-4" {onsubmit}>
		<h1 class="text-center text-2xl font-semibold">Log in</h1>

		{#if message}
			<p class="text-destructive text-sm">{message}</p>
		{/if}

		<div class="flex flex-col gap-1.5">
			<Label for="{uid}-email">Email</Label>
			<Input
				id="{uid}-email"
				type="email"
				autocomplete="email"
				bind:value={email}
				aria-invalid={emailMessage ? true : undefined}
			/>
			{#if emailMessage}
				<p class="text-destructive text-xs">{emailMessage}</p>
			{/if}
		</div>

		<div class="flex flex-col gap-1.5">
			<Label for="{uid}-password">Password</Label>
			<Input
				id="{uid}-password"
				type="password"
				autocomplete="current-password"
				bind:value={password}
				aria-invalid={passwordMessage ? true : undefined}
			/>
			{#if passwordMessage}
				<p class="text-destructive text-xs">{passwordMessage}</p>
			{/if}
		</div>

		<Button type="submit" disabled={busy}>
			{#if busy}
				<LoaderCircleIcon data-icon="inline-start" class="animate-spin" />
			{/if}
			Log in
		</Button>
	</form>

	<Marker.Root variant="separator">
		<Marker.Content>or</Marker.Content>
	</Marker.Root>

	<Button type="button" variant="secondary" disabled={busy} href={resolve('/projects')}>
		View local projects
	</Button>
</div>
