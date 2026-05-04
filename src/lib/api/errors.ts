import type { APIError, CredentialsError } from '$lib/types/api.type';
import { HTTPError } from 'ky';

export async function handleError(error: unknown): Promise<never> {
	if (error instanceof HTTPError) {
		const data = await error.response.json<{ detail: string }>();
		throw data.detail;
	}
	throw new Error('An unknown error occurred.');
}

export async function handleCredentialsError(error: unknown): Promise<never> {
	if (error instanceof HTTPError) {
		const data = await error.response.json();
		throw data as APIError | CredentialsError;
	}
	throw new Error('An unknown error occurred.');
}
