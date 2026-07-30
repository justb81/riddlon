import { unzipSync } from 'fflate';

export type UnzipErrorCode = 'CORRUPT_ZIP' | 'INVALID_JSON';

export interface UnzipError {
	code: UnzipErrorCode;
	/** Path of the offending entry, when the failure is entry-specific (INVALID_JSON). */
	path?: string;
	message: string;
}

export interface UnzippedPackage {
	/** Every `.json` entry, parsed — the shape `validatePackage()`/`loadStoryBundle()` expect. */
	jsonFiles: Record<string, unknown>;
	/** Every non-`.json` entry (assets), as raw bytes — not `validatePackage()`'s concern. */
	assetFiles: Record<string, Uint8Array>;
}

export type UnzipResult = { ok: true; value: UnzippedPackage } | { ok: false; error: UnzipError };

/**
 * Unpacks a story-package ZIP in-browser (no native unzip API exists) and splits its
 * entries into JSON files (parsed, ready for validatePackage) and binary assets (left as
 * bytes for the blob store). Never throws — a malformed archive or an entry that claims
 * to be JSON but isn't both become a distinguishable UnzipError instead of an exception.
 */
export function unzipPackage(bytes: Uint8Array): UnzipResult {
	let entries: Record<string, Uint8Array>;
	try {
		entries = unzipSync(bytes);
	} catch {
		return {
			ok: false,
			error: { code: 'CORRUPT_ZIP', message: 'The file is not a valid ZIP archive.' }
		};
	}

	const jsonFiles: Record<string, unknown> = {};
	const assetFiles: Record<string, Uint8Array> = {};
	const decoder = new TextDecoder();

	for (const [path, data] of Object.entries(entries)) {
		if (path.endsWith('/')) continue; // directory entry
		if (!path.endsWith('.json')) {
			assetFiles[path] = data;
			continue;
		}
		try {
			jsonFiles[path] = JSON.parse(decoder.decode(data));
		} catch {
			return {
				ok: false,
				error: { code: 'INVALID_JSON', path, message: `"${path}" is not valid JSON.` }
			};
		}
	}

	return { ok: true, value: { jsonFiles, assetFiles } };
}
