let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

export function registerFrameServiceWorker(): Promise<ServiceWorkerRegistration> {
	if (registrationPromise !== null) return registrationPromise;

	if (!('serviceWorker' in navigator)) {
		registrationPromise = Promise.reject(
			new Error('Service Workers are not supported in this browser')
		);
		return registrationPromise;
	}

	registrationPromise = navigator.serviceWorker.register('/service-worker.js', {
		scope: '/',
		type: 'module'
	});
	return registrationPromise;
}

/**
 * Returns a URL that the frame service worker will intercept and serve
 * from IndexedDB.
 */
export function getLocalFrameUrl(projectId: number, frameId: number): string {
	return `/local-frames/${projectId}/${frameId}`;
}

/**
 * Ensures the service worker is active and controlling this page.
 * Resolves once `navigator.serviceWorker.controller` is set.
 */
export async function ensureFrameServiceWorkerReady(): Promise<void> {
	await registerFrameServiceWorker();

	if (navigator.serviceWorker.controller) return;

	// Wait for the controller to be set (happens after skipWaiting + clients.claim)
	return new Promise((resolve) => {
		navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
			once: true
		});
	});
}
