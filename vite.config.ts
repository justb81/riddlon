import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

// `prompt-api-polyfill` can drive five backends and declares all of them as dependencies. We only
// ever configure its WebLLM one (see src/lib/llm/provider.ts); the other four talk to cloud services,
// which docs/concept.md §2/§8 rules out for core gameplay. Aliasing those SDKs to a throwing stub
// makes that structural rather than a convention: the polyfill's cloud backend chunks still exist,
// but they cannot import anything that reaches a server.
const CLOUD_BACKEND_STUB = '/src/lib/llm/stubs/unsupported-backend.ts';
const cloudBackendAliases = [
	{ find: /^firebase(\/.*)?$/, replacement: CLOUD_BACKEND_STUB },
	{ find: /^openai(\/.*)?$/, replacement: CLOUD_BACKEND_STUB },
	{ find: /^@google\/genai(\/.*)?$/, replacement: CLOUD_BACKEND_STUB },
	{ find: /^@huggingface\/transformers(\/.*)?$/, replacement: CLOUD_BACKEND_STUB }
];

export default defineConfig({
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
