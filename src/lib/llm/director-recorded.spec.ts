import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDirectorVerdict, type DirectorAllowlist, type DirectorVerdict } from './director.js';

/**
 * Real model answers, recorded through `/dev/story`'s "Director cases" → "Download runs" (#54; the
 * protocol is in `stories/README.md`). Parsing them again here pins the parser against what models
 * actually produce, not only against hand-written answers. A deliberate parser change that alters
 * a verdict means re-recording or editing that file's `verdict` — never loosening this test.
 */
interface RecordedRun {
	caseId: string;
	model: string;
	allowlist: DirectorAllowlist;
	raw: string;
	verdict: DirectorVerdict;
	error?: string;
}

const dir = path.resolve(__dirname, '__fixtures__/director-answers');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
const runs = files.flatMap((file) => {
	const { runs } = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as {
		runs: RecordedRun[];
	};
	return runs.filter((r) => !r.error).map((r, i) => ({ name: `${file} #${i} ${r.caseId}`, r }));
});

describe('recorded director answers', () => {
	if (runs.length === 0) {
		it.todo('record answers via /dev/story → Director cases → Download runs');
		return;
	}

	it.each(runs)('$name parses to the verdict recorded with it', ({ r }) => {
		expect(parseDirectorVerdict(r.raw, r.allowlist)).toEqual(r.verdict);
	});
});
