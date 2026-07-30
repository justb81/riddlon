import { zipSync, type Zippable } from 'fflate';

/**
 * Builds real ZIP bytes from a package's JSON-files map (as produced by
 * `buildValidPackageFiles()` and friends) plus optional binary assets, for exercising the
 * unzip/install pipeline against an actual archive instead of a pre-parsed files map.
 */
export function zipPackageFiles(
	jsonFiles: Record<string, unknown>,
	assetFiles: Record<string, Uint8Array> = {}
): Uint8Array {
	const encoder = new TextEncoder();
	const zippable: Zippable = {};
	for (const [path, value] of Object.entries(jsonFiles)) {
		zippable[path] = encoder.encode(JSON.stringify(value));
	}
	for (const [path, bytes] of Object.entries(assetFiles)) {
		zippable[path] = bytes;
	}
	return zipSync(zippable);
}
