import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
	getItem: (key: string) => store.get(key) ?? null,
	setItem: (key: string, value: string) => void store.set(key, value),
	removeItem: (key: string) => void store.delete(key)
});

const { activationCandidateIds, readActivePackageId, writeActivePackageId } =
	await import('./active-package.js');

const A = { id: 'pkg-a', installedAt: '2026-01-01T00:00:00.000Z' };
const B = { id: 'pkg-b', installedAt: '2026-02-01T00:00:00.000Z' };
const C = { id: 'pkg-c', installedAt: '2026-03-01T00:00:00.000Z' };

describe('activationCandidateIds', () => {
	it('puts the last active package first', () => {
		expect(activationCandidateIds('pkg-a', [A, B, C])).toEqual(['pkg-a', 'pkg-c', 'pkg-b']);
	});

	it('falls back to most recently installed when nothing was active yet', () => {
		expect(activationCandidateIds(null, [A, B, C])).toEqual(['pkg-c', 'pkg-b', 'pkg-a']);
	});

	it('ignores a pointer to a package that is no longer installed', () => {
		// "Alles löschen" plus a fresh import can leave a stale pointer behind; it must not
		// suppress the package that *is* there.
		expect(activationCandidateIds('pkg-gone', [A, B])).toEqual(['pkg-b', 'pkg-a']);
	});

	it('lists every package exactly once', () => {
		const ids = activationCandidateIds('pkg-b', [A, B, C]);
		expect(new Set(ids).size).toBe(3);
	});

	it('has no candidates for an empty library', () => {
		expect(activationCandidateIds('pkg-a', [])).toEqual([]);
	});
});

describe('the persisted pointer', () => {
	beforeEach(() => store.clear());

	it('round-trips and clears', () => {
		expect(readActivePackageId()).toBeNull();
		writeActivePackageId('pkg-a');
		expect(readActivePackageId()).toBe('pkg-a');
		writeActivePackageId(null);
		expect(readActivePackageId()).toBeNull();
	});
});
