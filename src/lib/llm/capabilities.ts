/**
 * What this device can actually do, probed once at boot.
 *
 * Everything here is browser-only and guarded: `docs/CLAUDE.md`'s rule is that nothing touching the
 * DOM or an optional browser API may run at module top level or during prerender.
 *
 * The decision logic itself is pulled out into pure functions so it can be tested in Node without
 * WebGPU or the Network Information API — see `capabilities-rules.ts`.
 */

import { browser } from '$app/environment';
import { DEFAULT_MODEL_ID, MODEL_ORDER, findModel, type LocalModelId } from './catalog.js';
import { type DeviceFacts, type MeteredFacts, isMeteredConnection } from './capabilities-rules.js';
import type { LlmErrorCode } from './errors.js';

export interface LlmCapabilities extends DeviceFacts {
	/** True when the browser exposes a built-in Prompt API we could use instead of downloading. */
	hasNativeLanguageModel: boolean;
	/** Undefined when the browser doesn't report it — see `isMeteredConnection`. */
	metered: boolean | undefined;
}

/**
 * Probes the device. Never throws: an unsupported browser is a normal outcome the splash has to
 * render, not an exception.
 */
export async function detectLlmCapabilities(): Promise<LlmCapabilities> {
	if (!browser) {
		return {
			hasNativeLanguageModel: false,
			hasWebGpu: false,
			maxBufferBytes: undefined,
			metered: undefined
		};
	}

	const hasNativeLanguageModel = 'LanguageModel' in globalThis;
	let hasWebGpu = false;
	let maxBufferBytes: number | undefined;

	try {
		const gpu = navigator.gpu;
		if (gpu) {
			const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
			if (adapter) {
				hasWebGpu = true;
				maxBufferBytes =
					adapter.limits?.maxStorageBufferBindingSize ?? adapter.limits?.maxBufferSize;
			}
		}
	} catch {
		// A browser that throws from requestAdapter has no usable WebGPU — same outcome as null.
		hasWebGpu = false;
	}

	return {
		hasNativeLanguageModel,
		hasWebGpu,
		maxBufferBytes,
		metered: readMeteredFacts()
	};
}

function readMeteredFacts(): boolean | undefined {
	if (!browser) return undefined;
	const connection = navigator.connection;
	if (!connection) return undefined;
	const facts: MeteredFacts = {
		saveData: connection.saveData,
		effectiveType: connection.effectiveType
	};
	return isMeteredConnection(facts);
}

/** Convenience wrapper so callers don't have to remember which catalog field to compare. */
export function canRunModel(capabilities: LlmCapabilities, modelId: LocalModelId): boolean {
	return unsupportedModelReason(capabilities, modelId) === undefined;
}

/**
 * Why a WebLLM catalog entry can't run on this device, for the settings picker to say something
 * more specific than "nicht unterstützt" — `undefined` when the model is fine. Never fires while a
 * native Prompt API is present: that backend wins regardless of which catalog model is selected, so
 * every WebLLM entry is moot rather than unsupported (see `usingBuiltIn` in the settings screen).
 */
export function unsupportedModelReason(
	capabilities: LlmCapabilities,
	modelId: LocalModelId
): LlmErrorCode | undefined {
	if (capabilities.hasNativeLanguageModel) return undefined;
	if (!capabilities.hasWebGpu) return 'no-webgpu';
	return fitsInDevice(capabilities, findModel(modelId).vramRequiredMB)
		? undefined
		: 'insufficient-vram';
}

/**
 * The WebLLM catalog entry to auto-load when no native Prompt API is present — the app decides this,
 * the player never picks a model directly (see the settings screen's read-only status list). Prefers
 * the largest model this device can actually hold, since a bigger model is the better fallback
 * whenever it fits; `MODEL_ORDER` is smallest-first, so this walks it in reverse.
 */
export function bestSupportedModelId(capabilities: LlmCapabilities): LocalModelId {
	const supported = [...MODEL_ORDER]
		.reverse()
		.find((id) => fitsInDevice(capabilities, findModel(id).vramRequiredMB));
	return supported ?? DEFAULT_MODEL_ID;
}

function fitsInDevice(capabilities: LlmCapabilities, vramRequiredMB: number): boolean {
	if (!capabilities.hasWebGpu) return false;
	if (capabilities.maxBufferBytes === undefined) return true;
	// A single weight buffer never needs the whole model in one allocation, but a device whose
	// largest possible buffer is a small fraction of the model will not hold it either. Compare
	// against a quarter of the model as a coarse floor rather than pretending to precision.
	const floorBytes = (vramRequiredMB / 4) * 1024 * 1024;
	return capabilities.maxBufferBytes >= floorBytes;
}
