import type { APIError, CredentialsError } from '$lib/types/api.type';
import { HTTPError } from 'ky';
import { toast } from 'svelte-sonner';

export function extractError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(typeof error === 'object' ? JSON.stringify(error) : error); // NOSONAR
}

/** Toasts an error and logs it: no toast-only errors. */
export function toastError(message: string, error?: unknown) {
	if (error === undefined) {
		console.error(message);
		toast.error(message);
	} else {
		console.error(message, error);
		toast.error(message, { description: extractError(error) });
	}
}

export async function handleError(error: unknown): Promise<string> {
	if (error instanceof HTTPError) {
		const data: APIError | undefined =
			error.data ??
			(error.response.bodyUsed
				? undefined
				: await error.response.json().catch(() => undefined));
		if (
			data &&
			typeof data === 'object' &&
			'detail' in data &&
			typeof data.detail === 'string'
		) {
			return data.detail;
		}
	}
	return extractError(error);
}

export async function handleCredentialsError(error: unknown): Promise<APIError | CredentialsError> {
	if (error instanceof HTTPError) {
		const data =
			error.data ??
			(error.response.bodyUsed
				? undefined
				: await error.response.json().catch(() => undefined));
		if (data && typeof data === 'object') {
			return data as APIError | CredentialsError;
		}
	}
	return { detail: extractError(error) };
}
