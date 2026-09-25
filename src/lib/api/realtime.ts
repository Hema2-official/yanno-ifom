import { getClient, http } from './kyConfig';
import { parseServerSentEvents } from 'parse-sse';
import type { EditLock, ProjectVersion, ServerTask } from '$lib/types/api.type';
import { handleError } from './errors';

async function* readableStreamToAsyncIterable<T>(stream: ReadableStream<T>): AsyncGenerator<T> {
	const reader = stream.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) return;
			yield value;
		}
	} finally {
		reader.cancel().catch(() => {});
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

	const events = parseServerSentEvents(response);

	for await (const event of readableStreamToAsyncIterable(events)) {
		yield JSON.parse(event.data) as ServerTask;
	}
}

export type EditSessionEvent =
	| { type: 'session'; data: { session_id: string } }
	| { type: 'state'; data: EditLock }
	| { type: 'ended'; data: { reason: 'revoked' | 'deleted' } };

const editSessionUrl = (version: ProjectVersion) =>
	`api/v0/realtime/projects/${version.project_id}/versions/${version.id}/edit_session`;

/**
 * Opens an edit session on the version: its id, then the lock's state whenever
 * it changes. `previous` is a dropped session to take the lock back from.
 */
export async function* streamEditSession(
	version: ProjectVersion,
	previous: string | null,
	signal: AbortSignal
): AsyncGenerator<EditSessionEvent> {
	const response = await getClient().get(editSessionUrl(version), {
		signal,
		retry: 0,
		searchParams: previous ? { previous } : undefined
	});

	for await (const event of readableStreamToAsyncIterable(parseServerSentEvents(response))) {
		yield { type: event.type, data: JSON.parse(event.data) } as EditSessionEvent;
	}
}

/** Takes the lock over; the outcome arrives on the session's stream. */
export async function stealEditSession(version: ProjectVersion, sessionId: string) {
	try {
		await http.post(`${editSessionUrl(version)}/steal`, { json: { session_id: sessionId } });
	} catch (error) {
		throw await handleError(error);
	}
}

export async function releaseEditSession(version: ProjectVersion, sessionId: string) {
	try {
		await http.post(`${editSessionUrl(version)}/release`, { json: { session_id: sessionId } });
	} catch (error) {
		throw await handleError(error);
	}
}
