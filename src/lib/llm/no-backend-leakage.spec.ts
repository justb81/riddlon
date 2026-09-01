import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LLM_MODELS } from './catalog.js';

/**
 * Issue #12's first acceptance criterion, as a standing guard rather than a promise.
 *
 * "Swapping the model requires no changes in engine/ or ui/" only stays true while the backend stays
 * behind `$lib/llm`. The moment a route imports `@mlc-ai/web-llm` directly, or a component
 * hardcodes an MLC model id, the abstraction is decorative. This test fails at that moment instead
 * of six months later.
 *
 * This file used to carry a fourth test forbidding any reference to a cloud provider SDK, on the
 * hypothesis that on-device inference alone would be enough. Issue #85 disproved it — every model
 * small enough for a weak device broke character, and the one that doesn't needs ~2.3 GB of VRAM
 * many devices lack — so players can now point the app at their own OpenAI-compatible endpoint and
 * that test was removed with the rule it encoded. The three below are containment, not doctrine:
 * they say where backend knowledge may live, not which backends are allowed.
 */

// `fileURLToPath` rather than `.pathname` — on Windows a `file://` URL's pathname keeps the
// leading slash in front of the drive letter (`/C:/Users/...`), which `fs`/`path` then resolve
// against the current drive, doubling it into `C:\C:\Users\...`.
const SRC = fileURLToPath(new URL('../../', import.meta.url));
const LLM_DIR = join('lib', 'llm');
const BACKEND_PACKAGES = ['@mlc-ai/web-llm'];
const MLC_MODEL_IDS = Object.values(LLM_MODELS).map((model) => model.mlcModelId);

function sourceFiles(): string[] {
	const found: string[] = [];

	function walk(dir: string): void {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
				walk(full);
				continue;
			}
			if (/\.(ts|js|svelte)$/.test(entry.name)) found.push(full);
		}
	}

	walk(SRC);
	return found;
}

function isInsideLlmModule(file: string): boolean {
	return relative(SRC, file).split(sep).join(sep).startsWith(LLM_DIR);
}

describe('backend containment', () => {
	it('finds the source tree', () => {
		expect(sourceFiles().length).toBeGreaterThan(20);
	});

	it('only $lib/llm references the inference packages', () => {
		const offenders: string[] = [];
		for (const file of sourceFiles()) {
			if (isInsideLlmModule(file)) continue;
			const contents = readFileSync(file, 'utf8');
			for (const pkg of BACKEND_PACKAGES) {
				if (contents.includes(pkg)) offenders.push(`${relative(SRC, file)} → ${pkg}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it('no MLC model id appears outside the catalog', () => {
		const catalogFile = join(SRC, LLM_DIR, 'catalog.ts');
		const offenders: string[] = [];
		for (const file of sourceFiles()) {
			if (file === catalogFile) continue;
			// The specs deliberately assert on these ids; they are not production coupling.
			if (/\.spec\.ts$/.test(file)) continue;
			const contents = readFileSync(file, 'utf8');
			for (const mlcId of MLC_MODEL_IDS) {
				if (contents.includes(mlcId)) offenders.push(`${relative(SRC, file)} → ${mlcId}`);
			}
		}
		expect(offenders).toEqual([]);
	});
});
