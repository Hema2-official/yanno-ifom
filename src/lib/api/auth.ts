import { http } from './kyConfig';
import type { AuthResponse } from '$lib/types/api.type';
import { handleCredentialsError, handleError } from './errors';

export async function login(email: string, password: string) {
	try {
		return await http.post<AuthResponse>(`api/v0/auth/login`, { json: { email, password } });
	} catch (error) {
		return await handleCredentialsError(error);
	}
}

export async function logout() {
	try {
		await http.text(`api/v0/auth/logout`);
	} catch (error) {
		await handleError(error);
	}
}

export async function register(email: string, password: string) {
	try {
		return await http.post<AuthResponse>(`api/v0/auth/register`, { json: { email, password } });
	} catch (error) {
		return await handleCredentialsError(error);
	}
}
