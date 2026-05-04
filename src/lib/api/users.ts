import { http } from './kyConfig';
import type { MeResponse } from '$lib/types/api.type';
import { handleError } from './errors';

export async function getMe() {
	try {
		return await http.get<MeResponse>(`users/me`);
	} catch (error) {
		await handleError(error);
	}
}
