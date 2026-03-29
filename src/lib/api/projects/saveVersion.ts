import axios from '../axiosConfig';
import { isAxiosError, type AxiosError } from 'axios';
import type { APIError } from '$lib/types/api.type';

const saveVersion = async (project_id: string, version: string, data: BlobPart) => {
	try {
		const blob = new Blob([data], { type: 'application/json' });
		const formData = new FormData();
		formData.append('data', blob, 'data.json');
		const response = await axios.patch(`projects/${project_id}/versions/${version}`, formData, {
			headers: {
				'Content-Type': 'multipart/form-data'
			}
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

export default saveVersion;
