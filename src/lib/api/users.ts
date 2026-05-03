import axios from './axiosConfig';
import type { MeResponse } from '$lib/types/api.type';
import { handleError } from './errors';

export async function getMe() {
	try {
		const response = await axios.get<MeResponse>(`users/me`);
		return response.data;
	} catch (error) {
		handleError(error);
	}
}
