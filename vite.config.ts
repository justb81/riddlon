import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { version as appVersion } from './package.json';

// `prompt-api-polyfill` can drive five backends and declares all of them as dependencies. We only
// ever configure its WebLLM one (see src/lib/llm/provider.ts); the other four talk to cloud services,
// which docs/concept.md §2/§8 rules out for core gameplay.
//
// Aliased here are the polyfill's own backend modules (`dist/backends/{firebase,gemini,openai,
// transformers}.js`), not the underlying cloud SDKs (`firebase`, `openai`, `@google/genai`,
// `@huggingface/transformers`) those modules import from. The polyfill's loader only ever consumes
// each backend module's default export, so a default-only stub is a complete replacement — whereas
// the SDKs themselves have large, version-dependent named-export surfaces (Rollup's static export
// analysis fails hard on a stub missing one, even though these backends are never *loaded* at runtime:
// our code never sets FIREBASE_CONFIG/GEMINI_CONFIG/OPENAI_CONFIG/TRANSFORMERS_CONFIG, only
// WEBLLM_CONFIG). Aliasing one level higher, at the backend module, sidesteps that entirely: the four
// cloud SDKs never enter the module graph, so "no cloud calls" (concept §2/§8) is enforced by the
// build rather than a promise about which config globals we happen to set.
const CLOUD_BACKEND_STUB = '/src/lib/llm/stubs/unsupported-backend.ts';
const cloudBackendAliases = [
	{ find: /^\.\/backends\/firebase\.js$/, replacement: CLOUD_BACKEND_STUB },
	{ find: /^\.\/backends\/gemini\.js$/, replacement: CLOUD_BACKEND_STUB },
	{ find: /^\.\/backends\/openai\.js$/, replacement: CLOUD_BACKEND_STUB },
	{ find: /^\.\/backends\/transformers\.js$/, replacement: CLOUD_BACKEND_STUB }
];

export default defineConfig({
	define: { __APP_VERSION__: JSON.stringify(appVersion) },
	resolve: { alias: cloudBackendAliases },
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// Register manually instead (see +layout.svelte): dev mode never registers one at
			// all, so a cache-first worker from a previous build can never mask fresh dev output.
			serviceWorker: { register: false },
			// GitHub Pages serves project sites from a /<repo-name> subpath. The deploy
			// workflow sets BASE_PATH accordingly; local dev/build defaults to root.
			paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}` }
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
