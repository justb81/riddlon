import { validatePackage, type PackageValidationErrorCode } from './validate-package.js';
import { unzipPackage, type UnzipErrorCode } from './unzip.js';
import { installPackageCharacters } from '$lib/characters/index.js';
import {
	assetKeyForBlob,
	putAsset,
	storyRegistry,
	type InstalledPackageSummary
} from '$lib/storage/index.js';

export type ImportErrorCode =
	| UnzipErrorCode
	| PackageValidationErrorCode
	| 'INSTALL_UNAVAILABLE'
	| 'NETWORK_ERROR'
	| 'INVALID_RESPONSE';

export interface ImportError {
	code: ImportErrorCode;
	path?: string;
	message: string;
}

export type ImportResult =
	{ ok: true; summary: InstalledPackageSummary } | { ok: false; errors: ImportError[] };

/**
 * The shared Installer step of #4.3's Importer/Installer/Registry split: takes already-
 * unpacked ZIP bytes (from a file picker or a one-time URL download — the two Importers in
 * #zip-import/#url-import), validates, stores every asset content-addressed, resolves
 * character references into the shared library, and registers the package in the local
 * story registry. Never throws; every failure mode is a distinguishable ImportError.
 */
export async function installPackageFromZipBytes(bytes: Uint8Array): Promise<ImportResult> {
	const unzipped = unzipPackage(bytes);
	if (!unzipped.ok) {
		return { ok: false, errors: [unzipped.error] };
	}

	const validation = validatePackage(unzipped.value.jsonFiles);
	if (!validation.valid || !validation.manifest) {
		return { ok: false, errors: validation.errors };
	}
	const manifest = validation.manifest;

	const assetKeys: Record<string, string> = {};
	for (const [path, data] of Object.entries(unzipped.value.assetFiles)) {
		const blob = new Blob([new Uint8Array(data)]);
		const key = await assetKeyForBlob(blob);
		await putAsset(key, blob);
		assetKeys[path] = key;
	}

	const characters = validation.characters ?? [];
	await installPackageCharacters(manifest.id, characters);

	const summary = await storyRegistry.install(manifest, {
		characterIds: characters.map((character) => character.id),
		sizeBytes: bytes.byteLength,
		assetKeys
	});

	if (!summary) {
		return {
			ok: false,
			errors: [
				{
					code: 'INSTALL_UNAVAILABLE',
					message: 'Local storage is unavailable in this environment.'
				}
			]
		};
	}

	return { ok: true, summary };
}
