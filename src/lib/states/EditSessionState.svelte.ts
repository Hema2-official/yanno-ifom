import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { HTTPError } from 'ky';
import { toastError } from '$lib/api/errors';
import { getVersionData } from '$lib/api/projects';
import { releaseEditSession, stealEditSession, streamEditSession } from '$lib/api/realtime';
import type { EditLock, ProjectVersion } from '$lib/types/api.type';
import { annotationState } from './AnnotationState.svelte';
import { editorState } from './EditorState.svelte';
import { projectState } from './ProjectState.svelte';

/** How long a dropped session waits before reconnecting. */
const RECONNECT_DELAY_MS = 2000;

type Run = { version: ProjectVersion; abort: AbortController };

/**
 * The editor's session on a cloud version: a stream that holds the version's
 * edit lock whenever it can (see the backend's core/edit_sessions.py). Only
 * the holder saves; everyone else looks at the data read-only.
 */
class EditSessionState {
	sessionId: string | null = $state(null);
	lock: EditLock | null = $state(null);
	#reloading = $state(false);

	/** This session holds the lock, nobody is taking it over, and the data is current. */
	canEdit = $derived(!!this.lock?.editing && !this.lock.steal && !this.#reloading);

	#run: Run | null = null;
	// Since when this session holds the lock: a new hold means others may have saved meanwhile
	#since: number | null = null;

	/** Opens a session, resolving once the lock's state is known. */
	start(version: ProjectVersion): Promise<void> {
		const run = { version, abort: new AbortController() };
		this.#run = run;
		return new Promise((ready, fail) => void this.#connect(run, ready, fail));
	}

	/** Ends the session; the server lets go of the lock once the pending saves are through. */
	async stop() {
		const run = this.#run;
		if (!run) return;
		this.#run = null;
		this.lock = null;
		this.sessionId = null;
		this.#since = null;
		this.#reloading = false;
		await projectState.idle(); // the saves carry the session id they were made with
		run.abort.abort();
	}

	/** Asks the holder for the lock: they get a few seconds to save first. */
	async takeOver() {
		if (!this.#run || !this.sessionId) return;
		await stealEditSession(this.#run.version, this.sessionId).catch((error: unknown) => {
			toastError("Couldn't take over", error);
		});
	}

	async #connect(run: Run, ready: () => void, fail: (error: unknown) => void) {
		let isReady = false;
		let prev: string | null = null;
		while (this.#run === run) {
			try {
				for await (const event of streamEditSession(run.version, prev, run.abort.signal)) {
					// A stopped session keeps its stream open until the saves are through
					if (this.#run !== run) continue;
					if (event.type === 'session') {
						this.sessionId = event.data.session_id;
					} else if (event.type === 'state') {
						await this.#update(run, event.data);
						if (!isReady) ready();
						isReady = true;
					} else if (event.type === 'ended') {
						return this.#end(event.data.reason);
					}
				}
			} catch (error) {
				if (!isReady) return fail(error);
				// Access removed or the version deleted while disconnected: retrying won't help
				const status = error instanceof HTTPError ? error.response.status : 0;
				if (this.#run === run && [401, 403, 404].includes(status)) {
					return this.#end('revoked');
				}
			}
			if (this.#run !== run) return;

			// Until a new stream says so, this session can't know it still holds the lock
			prev = this.sessionId;
			this.#lose();
			await new Promise((wake) => setTimeout(wake, RECONNECT_DELAY_MS));
		}
	}

	async #update(run: Run, state: EditLock) {
		const couldEdit = this.canEdit;
		// Read before the switch: once read-only, undos count as browsing the history
		const dirty = annotationState.isDirty;
		this.lock = state;
		if (couldEdit && !this.canEdit) await this.#letGo(run, dirty);
		else if (!couldEdit && this.canEdit) await this.#resume(run, state);
	}

	/** Saves what's pending while the lock is still ours, then hands it over if asked to. */
	async #letGo(run: Run, dirty: boolean) {
		if (dirty) annotationState.save();
		await projectState.idle();
		if (this.#run === run && this.lock?.editing && this.sessionId) {
			// Past the deadline, the server hands the lock over anyway
			await releaseEditSession(run.version, this.sessionId).catch(() => {});
		}
	}

	async #resume(run: Run, state: EditLock) {
		editorState.tool = 'cursor'; // tool shortcuts still set it while read-only
		const since = state.holder?.since ?? null;
		if (annotationState.saved && since !== this.#since) {
			this.#reloading = true;
			try {
				const data = await getVersionData(run.version);
				// The editor may have moved on to another version meanwhile
				if (this.#run !== run) return;
				annotationState.load(data);
			} catch (error) {
				toastError("Couldn't load the latest data", error);
			} finally {
				this.#reloading = false;
			}
		} else {
			annotationState.undoneCount = 0; // read-only undos only browsed the history
		}
		this.#since = since;
	}

	#lose() {
		const couldEdit = this.canEdit;
		const dirty = annotationState.isDirty;
		this.lock = null;
		// Gets through if the server hasn't noticed the drop yet
		if (couldEdit && dirty) annotationState.save();
	}

	#end(reason: 'revoked' | 'deleted') {
		this.#run = null;
		this.lock = null;
		this.sessionId = null;
		toastError(
			reason === 'deleted'
				? 'This version was deleted'
				: 'Your access to this project changed'
		);
		goto(resolve('/projects'));
	}
}

export const editSession = new EditSessionState();
