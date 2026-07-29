import { browser } from '$app/environment';

const CACHE_NAME = 'riddlon-assets-v1';

/**
 * Content-addressed key for a binary asset — byte-identical assets shared across
 * independently-installed packages (e.g. a reused character avatar) collapse to one
 * Cache entry instead of being duplicated per package.
 */
export async function assetKeyForBlob(blob: Blob): Promise<string> {
	const bytes = await blob.arrayBuffer();
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	const hex = Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
	return hex;
}

export async function putAsset(key: string, blob: Blob): Promise<void> {
	if (!browser) return;
	const cache = await caches.open(CACHE_NAME);
	await cache.put(assetRequestUrl(key), new Response(blob));
}

export async function getAsset(key: string): Promise<Blob | undefined> {
	if (!browser) return undefined;
	const cache = await caches.open(CACHE_NAME);
	const response = await cache.match(assetRequestUrl(key));
	return response ? await response.blob() : undefined;
}

export async function hasAsset(key: string): Promise<boolean> {
	if (!browser) return false;
	const cache = await caches.open(CACHE_NAME);
	return (await cache.match(assetRequestUrl(key))) !== undefined;
}

export async function deleteAsset(key: string): Promise<void> {
	if (!browser) return;
	const cache = await caches.open(CACHE_NAME);
	await cache.delete(assetRequestUrl(key));
}

function assetRequestUrl(key: string): string {
	return `https://riddlon.local/assets/${key}`;
}
