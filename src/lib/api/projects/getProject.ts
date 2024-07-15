import axios from '../axiosConfig';
import { isAxiosError, type AxiosError } from 'axios';
import type { APIError, Project } from '$lib/types/api.type';

const getProject = async (id: number) => {
	try {
		const response = await axios.get<Project>(`projects/${id}`);
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

export default getProject;
