import { resolve as appPath } from '$app/paths';
import type { ChangeType, TrackType } from '$lib/types/annotation.type';
import type { AnyStepParams, VersionStep, VideoConfig } from '$lib/types/api.type';
import type { WorkerMessage, WorkerRequest } from './worker';

export type ComputeDevice = 'gpu' | 'cpu';

export type ComputeRequest = {
	step: VersionStep;
	parameters: AnyStepParams;
	/** The original video. */
	video: Blob;
	videoConfig: VideoConfig;
	current: TrackType[];
	device: ComputeDevice;
};

/** The step's cells, and the change that records it, null when nothing changed. */
export type ComputeResult = { current: TrackType[]; change: ChangeType | null };

export const STEP_LOCK = 'step';

/** Runs a step and stores its result under a lock of every tab, which a new version waits for. */
export async function holdingStep<T>(work: () => Promise<T>): Promise<T> {
	return navigator.locks?.request(STEP_LOCK, { mode: 'shared' }, work) ?? work();
}

export async function hasWebGpu(): Promise<boolean> {
	return !!(await navigator.gpu?.requestAdapter().catch(() => null));
}

/** Keeps the screen on until the returned function is called, the tab hidden meanwhile included. */
function keepAwake(): () => void {
	let lock: Promise<WakeLockSentinel | null> | undefined;
	// The browser lets go of the lock while the tab is hidden
	const request = () => {
		if (document.visibilityState === 'visible') {
			lock = navigator.wakeLock?.request('screen').catch(() => null);
		}
	};
	request();
	document.addEventListener('visibilitychange', request);
	return () => {
		document.removeEventListener('visibilitychange', request);
		void lock?.then((sentinel) => sentinel?.release());
	};
}

/** Runs a step in a worker of its own, which an abort stops at once. */
export function runInBrowser(
	request: ComputeRequest,
	signal: AbortSignal,
	onProgress?: (message: string, fraction?: number) => void
): Promise<ComputeResult> {
	signal.throwIfAborted();
	const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
	// A sleeping computer would stop a long run
	const release = keepAwake();
	let abort = () => {};
	return new Promise<ComputeResult>((resolve, reject) => {
		abort = () => reject(signal.reason);
		signal.addEventListener('abort', abort, { once: true });
		worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
			if (data.type === 'progress') onProgress?.(data.message, data.fraction);
			else if (data.type === 'done') resolve(data.result);
			else reject(new Error(data.message));
		};
		worker.onerror = (event) => {
			event.preventDefault();
			reject(new Error(event.message || "The computation couldn't start"));
		};
		const message: WorkerRequest = {
			...request,
			models: new URL(`${appPath('/')}models/`, location.href).href
		};
		worker.postMessage(message);
	}).finally(() => {
		signal.removeEventListener('abort', abort);
		worker.terminate();
		release();
	});
}
