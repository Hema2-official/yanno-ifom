import { toast } from 'svelte-sonner';
import { resolve } from '$app/paths';
import { STEP_LOCK } from '$lib/compute/run';
import { annotationState } from '$lib/states/AnnotationState.svelte';
import { projectState } from '$lib/states/ProjectState.svelte';
import { updateState } from '$lib/states/UpdateState.svelte';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

async function reload() {
	annotationState.save();
	await projectState.idle();
	location.reload();
}

// A reload would end a step running in any tab, unasked if that tab is in the background
async function switchVersion(worker: ServiceWorker) {
	const { held } = await navigator.locks.query();
	if (held?.some((lock) => lock.name === STEP_LOCK))
		toast('Reloading once the running job finishes...');

	await navigator.locks.request(STEP_LOCK, async () => {
		worker.postMessage('activate');
		// A tab from the first visit isn't on the old version, so no switch reaches it
		if (!navigator.serviceWorker.controller) await reload();
	});
}

function offerUpdate(worker: ServiceWorker) {
	updateState.setCallback(() => void switchVersion(worker));

	toast('A new version is available', {
		id: 'update',
		description: "Switch when you're ready",
		duration: Infinity,
		action: { label: 'Switch', onClick: () => updateState.updateCallback?.() },
		cancel: { label: 'Later', onClick: () => {} }
	});
}

/** The dev server has no `precache.json`, so a worker left from before fails to update on each load. */
export async function dropWorkers() {
	const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
	await Promise.all(registrations.map((registration) => registration.unregister()));
}

/** Keeps a copy of the app in the browser, and offers each new version once it's downloaded. */
export async function keepAppUpdated() {
	const { serviceWorker } = navigator;
	if (!serviceWorker) return;

	const registration = await serviceWorker.register(`${resolve('/')}service-worker.js`);

	const offerOnceInstalled = (worker: ServiceWorker | null) => {
		worker?.addEventListener('statechange', () => {
			// The first version has nothing to replace
			if (worker.state === 'installed' && registration.active) offerUpdate(worker);
		});
	};
	if (registration.waiting) offerUpdate(registration.waiting);
	offerOnceInstalled(registration.installing);
	registration.addEventListener('updatefound', () => offerOnceInstalled(registration.installing));

	// Every tab goes together, since the old version's files are gone
	serviceWorker.addEventListener('controllerchange', () => void reload());

	// Watch for updates
	const check = () => void registration.update().catch(() => {});
	setInterval(check, CHECK_INTERVAL_MS);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') check();
	});
}
