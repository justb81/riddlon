import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Makes #7's acceptance criterion ("the engine has no dependency on any LLM backend")
 * an actual, enforced test rather than just a design intention: `engine/` decides what's
 * *allowed* to happen, `llm/` decides what a character *says* — the two must stay decoupled.
 */
const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));
const LLM_IMPORT_RE = /from\s+['"](\$lib\/llm(?:\/|['"])|\.{1,2}\/(?:.*\/)?llm\/)/;

function listSourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) return listSourceFiles(fullPath);
		return entry.name.endsWith('.ts') ? [fullPath] : [];
	});
}

describe('engine/ has no dependency on llm/', () => {
	it('no source file under src/lib/engine imports $lib/llm or a relative llm/ path', () => {
		const offenders = listSourceFiles(ENGINE_DIR).filter((file) =>
			LLM_IMPORT_RE.test(readFileSync(file, 'utf-8'))
		);
		expect(offenders).toEqual([]);
	});
});
