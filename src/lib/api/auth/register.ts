import axios from '../axiosConfig';
import { isAxiosError, type AxiosError } from 'axios';
import type { APIError, CredentialsError } from '$lib/types/api.type';

const register = async (email: string, password: string) => {
	try {
		const response = await axios.post(`auth/register`, { email, password });
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

export default register;
