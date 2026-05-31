/// <reference lib="webworker" />

import { localProjectsDb } from './lib/utils/indexeddb';

const sw = globalThis as unknown as ServiceWorkerGlobalScope;

const FRAME_URL_REGEX = /^\/local-frames\/(\d+)\/(\d+)$/;

// Activate immediately and claim all clients
sw.addEventListener('install', () => sw.skipWaiting());
sw.addEventListener('activate', (event) => {
	event.waitUntil(sw.clients.claim());
});

sw.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	const match = FRAME_URL_REGEX.exec(url.pathname);

	if (!match || match.length < 3) return; // Let all non-matching requests pass through

	const projectId = Number.parseInt(match[1], 10);
	const frameId = Number.parseInt(match[2], 10);

	event.respondWith(serveFrame(projectId, frameId));
});

/**
 * Reads a frame blob from IndexedDB and returns it as a Response.
 */
async function serveFrame(projectId: number, frameId: number): Promise<Response> {
	try {
		const frame = await localProjectsDb.frames.get([projectId, frameId]);

		if (!frame) {
			return new Response('Frame not found', { status: 404 });
		}

		return new Response(frame.image, {
			status: 200,
			headers: {
				'Content-Type': 'image/webp',
				'Cache-Control': 'no-store'
			}
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return new Response(`Internal error: ${message}`, { status: 500 });
	}
}
