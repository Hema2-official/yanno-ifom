import type { Progress } from 'ky';
import { BASE_URL } from './kyConfig';

export type UploadOptions = {
	onUploadProgress?: (progress: Progress) => void;
};

/**
 * XHR-based upload helper that supports progress reporting.
 * Ky has compatibility issues with Safari and Firefox on this regard.
 */
export function postFormData<T>(url: string, body: FormData, options?: UploadOptions): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', (BASE_URL.endsWith('/') ? BASE_URL : BASE_URL + '/') + url);
		xhr.withCredentials = true; // Cookie auth, like ky's credentials: 'include'

		const { onUploadProgress } = options ?? {};
		if (onUploadProgress) {
			xhr.upload.addEventListener('progress', (event) => {
				if (!event.lengthComputable) return;
				onUploadProgress({
					percent: event.total === 0 ? 0 : event.loaded / event.total,
					transferredBytes: event.loaded,
					totalBytes: event.total
				});
			});
		}

		xhr.addEventListener('load', () => {
			if (xhr.status >= 200 && xhr.status < 300) resolve(parseJson(xhr.responseText) as T);
			else reject(new Error(errorMessage(xhr)));
		});
		xhr.addEventListener('error', () => reject(new Error('Network error')));
		xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

		xhr.send(body);
	});
}

function parseJson(text: string): unknown {
	if (!text) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/** Reads the API's `detail` out of an error body, like `handleError` does for ky errors. */
function errorMessage(xhr: XMLHttpRequest): string {
	const data = parseJson(xhr.responseText);
	if (data && typeof data === 'object' && 'detail' in data && typeof data.detail === 'string') {
		return data.detail;
	}
	return `Request failed with status code ${xhr.status}`;
}
