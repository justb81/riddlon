/**
 * Stands in for the four cloud SDKs the Prompt API polyfill can reach (Firebase AI Logic, the Gemini
 * API, OpenAI, and Transformers.js) via `resolve.alias` in vite.config.ts.
 *
 * docs/concept.md §2 and §8 rule out cloud inference for the core game, and issue #12 says "no cloud
 * calls anywhere in this module". Aliasing the SDKs away makes that structural rather than a
 * convention: the polyfill's backend chunks still exist, but they cannot import anything that talks
 * to a server. Only its WebLLM backend — configured in `provider.ts` — remains reachable.
 *
 * The Proxy means even a property read fails loudly, rather than a bundler-level tree-shake quietly
 * turning a mistaken import into `undefined` at runtime.
 */

const message =
	'Riddlon runs inference locally only — this cloud backend is stubbed out at build time. ' +
	'See src/lib/llm/stubs/unsupported-backend.ts and docs/concept.md §2.';

function refuse(): never {
	throw new Error(message);
}

const unsupported: unknown = new Proxy(
	function unsupportedBackend() {
		refuse();
	},
	{
		get(_target, property) {
			// Let module-shape probes fail gracefully instead of throwing during interop checks.
			if (property === '__esModule' || property === Symbol.toStringTag) return undefined;
			refuse();
		},
		apply: refuse,
		construct: refuse
	}
);

export default unsupported;
