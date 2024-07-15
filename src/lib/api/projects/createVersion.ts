import axios from '../axiosConfig';
import { isAxiosError, type AxiosError } from 'axios';
import type { APIError } from '$lib/types/api.type';

const createVersion = async (project_id: number, name: string, source_version?: string) => {
	try {
		const response = await axios.post(`projects/${project_id}/versions`, {
			name,
			source_version
		});
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

export default createVersion;
