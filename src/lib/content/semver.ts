/**
 * Minimal x.y.z semver parsing/comparison for story-package version fields
 * (docs/concept.md §5.2). No pre-release or build-metadata support — the doc
 * never shows either, so this stays intentionally narrow until a real need appears.
 */
export interface Semver {
	major: number;
	minor: number;
	patch: number;
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSemver(value: string): Semver | undefined {
	const match = SEMVER_RE.exec(value);
	if (!match) return undefined;
	const [, major, minor, patch] = match;
	return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

export function compareSemver(a: Semver, b: Semver): -1 | 0 | 1 {
	if (a.major !== b.major) return a.major < b.major ? -1 : 1;
	if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
	if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
	return 0;
}
