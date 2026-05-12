import { http } from './kyConfig';
import type { Options } from 'ky';
import type { MeResponse } from '$lib/types/api.type';
import { handleError } from './errors';

export async function getMe(options?: Options) {
	try {
		return await http.get<MeResponse>(`api/v0/users/me`, options);
	} catch (error) {
		await handleError(error);
	}
}
