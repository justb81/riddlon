/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// SvelteKit auto-registers this file in production builds. It precaches the app
// shell + static assets for offline use and serves them cache-first, so the app
// keeps working without a network connection.
//
// A newly installed worker deliberately does NOT call skipWaiting() itself —
// it sits in the "waiting" state so the already-open page keeps running on the
// version it loaded, until the user opts in via the update banner (driven by
// `$lib/state/update.svelte.ts`), which posts SKIP_WAITING below. Without this,
// an update can silently take over mid-session with no way for the page to
// know its already-executing JS is stale.

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Prefixed so the activate sweep below can tell our own shell caches apart from every other
// cache on the origin. `riddlon-assets-v1` ($lib/storage/blob-store.ts) and the multi-GB model
// weight cache the local LLM keeps are NOT ours to delete.
const SHELL_PREFIX = 'riddlon-shell-';
const CACHE = `${SHELL_PREFIX}${version}`;
const PRECACHE = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

sw.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// Only sweep our own superseded shell caches. Deleting everything else would wipe
			// the asset blob store and the local model weights on every single app update,
			// turning each release into a multi-GB re-download and breaking offline play.
			for (const key of await caches.keys()) {
				if (key.startsWith(SHELL_PREFIX) && key !== CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	// Let the browser handle anything that isn't ours. Cross-origin responses were never cached
	// here anyway, and routing them through this handler would proxy every model weight shard
	// (gigabytes, sometimes as range requests) through the worker for no benefit.
	const url = new URL(event.request.url);
	if (url.origin !== location.origin) return;
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			const cached = await cache.match(event.request);
			if (cached) return cached;

			try {
				const response = await fetch(event.request);
				if (response.ok) cache.put(event.request, response.clone());
				return response;
			} catch (err) {
				const fallback = await cache.match(event.request);
				if (fallback) return fallback;
				throw err;
			}
		})()
	);
});
