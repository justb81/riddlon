/**
 * The slice of WebGPU `capabilities.ts` actually reads.
 *
 * Deliberately not `@webgpu/types`: we only feature-detect and read one limit, and adding the package
 * would mean maintaining a `types` array against SvelteKit's generated tsconfig for no gain.
 */

interface RiddlonGpuSupportedLimits {
	readonly maxBufferSize?: number;
	readonly maxStorageBufferBindingSize?: number;
}

interface RiddlonGpuAdapter {
	readonly limits?: RiddlonGpuSupportedLimits;
}

interface RiddlonGpu {
	requestAdapter(options?: {
		powerPreference?: 'low-power' | 'high-performance';
	}): Promise<RiddlonGpuAdapter | null>;
}

interface Navigator {
	readonly gpu?: RiddlonGpu;
	/** Network Information API — Chromium only, so every read must tolerate `undefined`. */
	readonly connection?: {
		readonly saveData?: boolean;
		readonly effectiveType?: string;
	};
}
