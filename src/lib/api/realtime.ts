import { BASE_URL } from './kyConfig';
import type { ProjectVersion, ServerTask } from '$lib/types/api.type';
import { handleError } from './errors';

export function streamTask(version: ProjectVersion, callback: (task: ServerTask) => void) {
	// TODO: https://github.com/sindresorhus/parse-sse#with-ky
	const uri = `${BASE_URL}api/v0/realtime/projects/${version.project_id}/versions/${version.id}/stream_task`;
	const eventSource = new EventSource(uri, { withCredentials: true });

	eventSource.onmessage = (event) => {
		const task = JSON.parse(event.data) as ServerTask;
		callback(task);
	};

	eventSource.onerror = (event) => {
		handleError(event);
	};

	return () => {
		if (eventSource.readyState !== EventSource.CLOSED) eventSource.close();
	};
}
