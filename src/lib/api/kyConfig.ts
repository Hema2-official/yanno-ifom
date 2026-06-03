import ky, { type Options } from 'ky';

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:9000/';

const internalClient = ky.create({
	prefix: BASE_URL,
	credentials: 'include',
	timeout: 60000
});

export const getClient = () => internalClient;

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

function jsonMethod(method: HttpMethod) {
	async function fn<T>(url: string, options?: Options): Promise<T>;
	async function fn(url: string, options?: Options): Promise<void>;
	async function fn<T = void>(url: string, options?: Options): Promise<T | void> {
		const r = await getClient()[method](url, options);

		// Return undefined if no content was received
		if (r.status === 204 || r.headers.get('content-length') === '0') return undefined;

		// Parse the response as JSON and return the result
		return r.json() as Promise<T>;
	}
	return fn;
}

export const http = {
	get: jsonMethod('get'),
	post: jsonMethod('post'),
	put: jsonMethod('put'),
	patch: jsonMethod('patch'),
	delete: jsonMethod('delete'),
	blob: (url: string, options?: Options) => getClient().get(url, options).blob(),
	text: (url: string, options?: Options) => getClient().get(url, options).text()
};
