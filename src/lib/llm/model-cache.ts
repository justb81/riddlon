/**
 * "Is this model already on the device?" — which decides warm vs. first-run boot.
 *
 * The polyfill cannot answer it: its `availability()` returns 'available' unconditionally, download
 * or no download. So for the WebLLM path we ask web-llm's own `hasModelInCache` directly, and the
 * appConfig we pass has to match what the polyfill's backend passes to `CreateMLCEngine`
 * (`{...prebuiltAppConfig, cacheBackend: 'cross-origin'}`) or we'd be inspecting a different cache.
 *
 * Because that coupling is a guess about someone else's internals, a local marker backs it up. Each
 * alone is wrong in a different way — the marker goes stale when site data is cleared, the probe is
 * wrong if the appConfig guess drifts — and together the worst case is one unnecessary progress bar
 * rather than a broken boot.
 */

import { browser } from '$app/environment';
import { findModel, type LocalModelId } from './catalog.js';

const MARKER_PREFIX = 'riddlon:llm:cached:';

export async function isModelCached(modelId: LocalModelId): Promise<boolean> {
	if (!browser) return false;
	const model = findModel(modelId);

	try {
		const { hasModelInCache, prebuiltAppConfig } = await import('@mlc-ai/web-llm');
		return await hasModelInCache(model.mlcModelId, {
			...prebuiltAppConfig,
			cacheBackend: 'cross-origin'
		});
	} catch {
		// web-llm unavailable, or its cache layout changed under us — fall back to what we recorded.
		return hasMarker(model.mlcModelId);
	}
}

/** Records a completed first load, as the fallback answer for `isModelCached`. */
export function markModelCached(modelId: LocalModelId): void {
	if (!browser) return;
	try {
		localStorage.setItem(`${MARKER_PREFIX}${findModel(modelId).mlcModelId}`, '1');
	} catch {
		// Private mode or a full quota: the probe above is the primary answer anyway, and the cost of
		// losing the marker is a first-run splash that shouldn't have appeared.
	}
}

/** Frees the weights of a model the player no longer wants. Not yet surfaced in the UI. */
export async function deleteModel(modelId: LocalModelId): Promise<void> {
	if (!browser) return;
	const model = findModel(modelId);

	try {
		const { deleteModelInCache, prebuiltAppConfig } = await import('@mlc-ai/web-llm');
		await deleteModelInCache(model.mlcModelId, {
			...prebuiltAppConfig,
			cacheBackend: 'cross-origin'
		});
	} finally {
		try {
			localStorage.removeItem(`${MARKER_PREFIX}${model.mlcModelId}`);
		} catch {
			// Nothing to do — the marker is only ever a hint.
		}
	}
}

function hasMarker(mlcModelId: string): boolean {
	try {
		return localStorage.getItem(`${MARKER_PREFIX}${mlcModelId}`) === '1';
	} catch {
		return false;
	}
}
