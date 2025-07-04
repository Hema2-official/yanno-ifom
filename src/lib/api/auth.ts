import type { LoginResponse } from '$lib/types/api.type';
import axios from './axiosConfig';
import { handleCredentialsError, handleError } from './errors';

export async function login(email: string, password: string) {
	try {
		const response = await axios.post<LoginResponse>(`auth/login`, { email, password });
		return response.data;
	} catch (error) {
		handleCredentialsError(error);
	}
}

export async function logout() {
	try {
		const response = await axios.get(`auth/logout`);
		return response.request?.response.url as string;
	} catch (error) {
		handleError(error);
	}
}

export async function register(email: string, password: string) {
	try {
		const response = await axios.post(`auth/register`, { email, password });
		return response.data;
	} catch (error) {
		handleCredentialsError(error);
	}
}
