import axios from '../axiosConfig';
import { isAxiosError, type AxiosError } from 'axios';
import type { APIError } from '$lib/types/api.type';

const deleteProject = async (id: number) => {
	try {
		const response = await axios.delete(`projects/${id}`);
		return response.data;
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

export default deleteProject;
