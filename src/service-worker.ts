/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/**
 * Keeps a copy of the app in the browser, so it opens while the server is down. A new version
 * waits for the old one's tabs to close, or for the app's offer to be taken (`utils/updates.ts`),
 * so it never pulls files from under a running step.
 */
import { version } from '$app/env';
import { resolve } from '$app/paths';

const sw = self as unknown as ServiceWorkerGlobalScope;

const ROOT = resolve('/');
const PREFIX = 'app-';
const CACHE = `${PREFIX}${version}`;

async function keepApp() {
	const list = await fetch(`${ROOT}precache.json`, { cache: 'no-store' });
	const files: string[] = await list.json();
	const cache = await caches.open(CACHE);
	await cache.addAll(files.map((file) => new Request(`${ROOT}${file}`, { cache: 'no-cache' })));
}

// The models share the cache storage, under a name of their own
async function dropOldVersions() {
	const names = await caches.keys();
	const old = names.filter((name) => name.startsWith(PREFIX) && name !== CACHE);
	await Promise.all(old.map((name) => caches.delete(name)));
}

async function respond(request: Request) {
	const cache = await caches.open(CACHE);
	const file = request.mode === 'navigate' ? `${ROOT}index.html` : request;
	return (await cache.match(file, { ignoreVary: true })) ?? fetch(request);
}

sw.addEventListener('install', (event) => event.waitUntil(keepApp()));
sw.addEventListener('activate', (event) => event.waitUntil(dropOldVersions()));
sw.addEventListener('message', (event) => {
	if (event.data === 'activate') void sw.skipWaiting();
});
sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
	event.respondWith(respond(request));
});
