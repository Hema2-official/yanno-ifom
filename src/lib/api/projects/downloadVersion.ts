import axios from '../axiosConfig';
import { isAxiosError, type AxiosError } from 'axios';
import type { APIError } from '$lib/types/api.type';

const downloadVersion = async (project_id: number, version_name: string) => {
	try {
		const response = await axios.get<Blob>(`projects/${project_id}/versions/${version_name}`, {
			responseType: 'blob'
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

export default downloadVersion;
