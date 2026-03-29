import type { APIError, CredentialsError, AuthResponse } from '$lib/types/api.type';
import axios from '../axiosConfig';
import { isAxiosError, type AxiosError } from 'axios';

const login = async (email: string, password: string) => {
	try {
		const response = await axios.post<AuthResponse>(`auth/login`, { email, password });
		return response.data;
	} catch (error) {
		if (isAxiosError(error)) {
			const axiosError = error as AxiosError<APIError | CredentialsError>;
			if (axiosError.response) {
				throw error;
			}
		}
		throw new Error('An unknown error occurred.');
	}
};

export default login;
