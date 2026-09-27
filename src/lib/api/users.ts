import { http } from './kyConfig';
import type { Options } from 'ky';
import type { MeResponse, UserSummary } from '$lib/types/api.type';
import { handleError } from './errors';

export async function getMe(options?: Options) {
	try {
		return await http.get<MeResponse>(`api/v0/users/me`, options);
	} catch (error) {
		throw await handleError(error);
	}
}

export async function updateMe(body: { name: string }, options?: Options) {
	try {
		return await http.patch<MeResponse>(`api/v0/users/me`, { ...options, json: body });
	} catch (error) {
		throw await handleError(error);
	}
}

export async function updatePreferences(patch: Record<string, unknown>, options?: Options) {
	try {
		return await http.patch<Record<string, unknown>>(`api/v0/users/me/preferences`, {
			...options,
			json: patch
		});
	} catch (error) {
		throw await handleError(error);
	}
}

/** Users whose name or email contains `search`, to share projects with. */
export async function searchUsers(search: string, options?: Options) {
	try {
		return await http.get<UserSummary[]>(`api/v0/users/`, {
			...options,
			searchParams: { search }
		});
	} catch (error) {
		throw await handleError(error);
	}
}
