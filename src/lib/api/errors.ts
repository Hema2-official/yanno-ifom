import type { APIError, CredentialsError } from '$lib/types/api.type';
import { AxiosError, isAxiosError } from 'axios';

export function handleError(error: unknown): never {
	if (isAxiosError(error)) {
		const axiosError = error as AxiosError<APIError>;
		if (axiosError.response) {
			throw axiosError.response.data.detail;
		}
	}
	throw new Error('An unknown error occurred.');
}

export function handleCredentialsError(error: unknown): never {
	if (isAxiosError(error)) {
		const axiosError = error as AxiosError<APIError | CredentialsError>;
		if (axiosError.response) {
			throw error;
		}
	}
	throw new Error('An unknown error occurred.');
}
