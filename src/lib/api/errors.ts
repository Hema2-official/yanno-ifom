import type { APIError, CredentialsError } from '$lib/types/api.type';
import { HTTPError } from 'ky';

export async function handleError(error: unknown) {
	if (error instanceof HTTPError) {
		const data = await error.response.json<{ detail: string }>();
		return data.detail;
	}
	return new Error('An unknown error occurred.');
}

export async function handleCredentialsError(error: unknown) {
	if (error instanceof HTTPError) {
		const data = await error.response.json();
		return data as APIError | CredentialsError;
	}
	return new Error('An unknown error occurred.');
}
