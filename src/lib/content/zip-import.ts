import { installPackageFromZipBytes, type ImportResult } from './install-package.js';

/**
 * The ZIP Importer (#zip-import, docs/concept.md §4.1.1): local file selection, independent
 * of network/CORS. Hands the raw bytes straight to the shared Installer — this module's only
 * job is turning a `File` (from an `<input type="file">` or drag-and-drop) into bytes.
 */
export async function importPackageFromZipFile(file: File): Promise<ImportResult> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	return installPackageFromZipBytes(bytes);
}
