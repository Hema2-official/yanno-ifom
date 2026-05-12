import ky, { type Options } from 'ky';

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:9000/';

let internalClient = ky.create({
	prefix: BASE_URL,
	credentials: 'include',
	timeout: 60000
});

export const getClient = () => internalClient;

export const http = {
	get: <T>(url: string, options?: Options) => getClient().get(url, options).json<T>(),
	post: <T>(url: string, options?: Options) => getClient().post(url, options).json<T>(),
	put: <T>(url: string, options?: Options) => getClient().put(url, options).json<T>(),
	patch: <T>(url: string, options?: Options) => getClient().patch(url, options).json<T>(),
	delete: <T>(url: string, options?: Options) => getClient().delete(url, options).json<T>(),
	deleteRaw: (url: string, options?: Options) => getClient().delete(url, options),
	blob: (url: string, options?: Options) => getClient().get(url, options).blob(),
	text: (url: string, options?: Options) => getClient().get(url, options).text()
};
