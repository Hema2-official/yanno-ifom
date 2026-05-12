import { getClient } from './kyConfig';
import { parseServerSentEvents } from 'parse-sse';
import type { ProjectVersion, ServerTask } from '$lib/types/api.type';

async function* readableStreamToAsyncIterable<T>(stream: ReadableStream<T>): AsyncGenerator<T> {
	const reader = stream.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) return;
			yield value;
		}
	} finally {
		reader.releaseLock();
	}
}

export async function* streamTask(
	version: ProjectVersion,
	signal?: AbortSignal
): AsyncGenerator<ServerTask> {
	const response = await getClient().get(
		`api/v0/realtime/projects/${version.project_id}/versions/${version.id}/stream_task`,
		{ signal }
	);

	const events = parseServerSentEvents(response as Response);

	for await (const event of readableStreamToAsyncIterable(events)) {
		yield JSON.parse(event.data) as ServerTask;
	}
}
