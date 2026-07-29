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
import { findModel, type LocalModelId } from './catalog.js';
import { type DeviceFacts, type MeteredFacts, isMeteredConnection } from './capabilities-rules.js';

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
	if (capabilities.hasNativeLanguageModel) return true;
	return fitsInDevice(capabilities, findModel(modelId).vramRequiredMB);
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
