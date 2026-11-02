import { http } from './kyConfig';
import type { Options } from 'ky';
import type { AuthResponse } from '$lib/types/api.type';
import { handleCredentialsError, handleError } from './errors';

export async function login(email: string, password: string, options?: Options) {
	try {
		return await http.post<AuthResponse>(`api/v0/auth/login`, {
			...options,
			json: { email, password }
		});
	} catch (error) {
		throw await handleCredentialsError(error);
	}
}

export async function logout(options?: Options) {
	try {
		await http.text(`api/v0/auth/logout`, options);
	} catch (error) {
		throw await handleError(error);
	}
}

export async function register(email: string, password: string, name?: string, options?: Options) {
	try {
		return await http.post<AuthResponse>(`api/v0/auth/register`, {
			...options,
			json: { email, password, name }
		});
	} catch (error) {
		throw await handleCredentialsError(error);
	}
}
