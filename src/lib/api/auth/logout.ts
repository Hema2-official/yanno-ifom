import type { APIError } from '$lib/types/api.type';
import axios from '../axiosConfig';
import { isAxiosError, type AxiosError } from 'axios';

const logout = async () => {
	try {
		const response = await axios.get(`auth/logout`);
		return response.request?.response.url as string;
	} catch (error) {
		if (isAxiosError(error)) {
			const axiosError = error as AxiosError<APIError>;
			if (axiosError.response) {
				throw new Error(axiosError.response.data.detail);
			}
		}
		throw new Error('An unknown error occurred.');
	}
};

export default logout;
