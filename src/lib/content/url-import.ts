import { installPackageFromZipBytes, type ImportResult } from './install-package.js';

/**
 * The URL Importer (#url-import, docs/arc42 §6.2): downloads a package ZIP exactly
 * once and hands it to the same Installer the ZIP Importer uses — nothing about the
 * installed story ever depends on re-fetching from `url` again. Network-level failures
 * (unreachable host, CORS) and a non-2xx response get their own error codes, distinguishable
 * from the ZIP Installer's validation errors.
 */
export async function importPackageFromUrl(url: string): Promise<ImportResult> {
	let response: Response;
	try {
		response = await fetch(url);
	} catch {
		return {
			ok: false,
			errors: [
				{
					code: 'NETWORK_ERROR',
					message: `Could not reach "${url}" — the host may be unreachable, or the request was blocked by CORS.`
				}
			]
		};
	}

	if (!response.ok) {
		return {
			ok: false,
			errors: [
				{
					code: 'INVALID_RESPONSE',
					message: `"${url}" responded with ${response.status} ${response.statusText}.`
				}
			]
		};
	}

	const bytes = new Uint8Array(await response.arrayBuffer());
	return installPackageFromZipBytes(bytes);
}
