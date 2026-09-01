#!/usr/bin/env node
/**
 * Validates and packs every story package under `stories/` into an installable `.zip`
 * (docs/arc42 §8.1, issue #19). One directory under `stories/` = one package = one
 * independently versioned GitHub release; nothing here is specific to "Lucys Portmonnaie".
 *
 *   node scripts/build-stories.mjs           # validate + write dist/stories/*.zip
 *   node scripts/build-stories.mjs --check   # validate only, write nothing
 *   node scripts/build-stories.mjs --static  # write static/stories/*.zip for the app to install
 *
 * The validator is the app's own `src/lib/content/validate-package.ts` — the exact code the
 * player runs on import (#10), loaded through Vite so the build step and the runtime can
 * never drift into disagreeing about what a valid package is. Vite is already a devDependency;
 * loading the TypeScript module through it is what avoids adding a separate TS runner.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORIES_DIR = path.join(ROOT, 'stories');

/**
 * Repo-facing files that document/exercise a package for contributors but aren't part of it.
 * A `walkthrough*.json` is `scripts/playtest-story.mjs`'s scripted step list (see that file) —
 * authoring-only, same as `README.md`, and read straight off disk rather than through the
 * manifest, so it never needs a `manifest.world` entry. The prefix match covers the per-branch
 * walkthroughs a branching story needs (`walkthrough-false-accusation.json`), which must not end
 * up in the shipped zip either.
 */
const NOT_PACKAGE_CONTENT = new Set(['README.md', '.DS_Store']);

function isPackageContent(relativePath) {
	const name = path.basename(relativePath);
	if (NOT_PACKAGE_CONTENT.has(name)) return false;
	return !(name.startsWith('walkthrough') && name.endsWith('.json'));
}

/** Generated per build (see `checksums()`), so a stale copy on disk is never shipped. */
const CHECKSUMS_PATH = 'signatures/checksums.json';

const checkOnly = process.argv.includes('--check');
/**
 * `--static` packs into `static/stories/` instead of `dist/stories/`, so the app ships the same
 * bytes the release publishes and can install them through the ordinary URL importer
 * (`content/url-import.ts`) — the player has no second, privileged install path. Being under
 * `static/` at build time also puts them in the service worker's precache list, which is what
 * makes the first install work offline. Release artifacts stay in `dist/` untouched.
 */
const toStatic = process.argv.includes('--static');
const OUT_DIR = path.join(ROOT, toStatic ? 'static' : 'dist', 'stories');

// --- package discovery ------------------------------------------------------------------

/** All files under `dir`, as package-relative POSIX paths, sorted for deterministic output. */
async function listFiles(dir, prefix = '') {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (!isPackageContent(relative)) continue;
		if (entry.isDirectory()) files.push(...(await listFiles(path.join(dir, entry.name), relative)));
		else files.push(relative);
	}
	return files.sort();
}

async function readPackage(dir) {
	const paths = await listFiles(dir);
	const contents = new Map();
	for (const relative of paths) contents.set(relative, await readFile(path.join(dir, relative)));
	return contents;
}

/** JSON files parsed for the validator; a syntax error becomes a normal validation error. */
function parseJsonFiles(contents) {
	const parsed = {};
	const errors = [];
	for (const [relative, bytes] of contents) {
		if (!relative.endsWith('.json')) continue;
		try {
			parsed[relative] = JSON.parse(bytes.toString('utf8'));
		} catch (error) {
			errors.push({ code: 'INVALID_JSON', path: relative, message: String(error.message) });
		}
	}
	return { parsed, errors };
}

// --- checks the JSON schema can't express -----------------------------------------------

/**
 * A `world/*.json` sitting in the directory but missing from `manifest.world` is loaded by
 * nobody — the player only ever reads what the manifest declares. Silent-ignore is the worst
 * outcome for an author, so undeclared story content fails the build.
 */
function checkUndeclaredContent(manifest, contents) {
	const declared = new Set([
		'manifest.json',
		manifest.entryStory,
		manifest.entryGraph,
		...(manifest.characters ?? []),
		...(manifest.world ?? [])
	]);
	const assetsBase = manifest.assetsBase ?? 'assets/';
	return [...contents.keys()]
		.filter((relative) => relative.endsWith('.json'))
		.filter((relative) => !declared.has(relative) && !relative.startsWith(assetsBase))
		.map((relative) => ({
			code: 'UNDECLARED_CONTENT',
			path: relative,
			message: `"${relative}" is not referenced from manifest.json — the player would never load it`
		}));
}

/** Character `avatar` paths are plain strings to the schema; verify they resolve to a real file. */
function checkAssetReferences(manifest, parsed, contents) {
	const errors = [];
	for (const charPath of manifest.characters ?? []) {
		const avatar = parsed[charPath]?.avatar;
		if (avatar && !contents.has(avatar)) {
			errors.push({
				code: 'MISSING_ASSET',
				path: `${charPath}#/avatar`,
				message: `avatar "${avatar}" is not present in the package`
			});
		}
	}
	return errors;
}

// --- packing ----------------------------------------------------------------------------

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** docs/arc42 §8.1's `signatures/checksums.json`, generated over the packed content. */
function checksums(contents) {
	const files = {};
	for (const relative of [...contents.keys()].sort())
		files[relative] = sha256(contents.get(relative));
	return Buffer.from(`${JSON.stringify({ algorithm: 'sha256', files }, null, '\t')}\n`, 'utf8');
}

// Fixed 1980-01-01 DOS timestamp on every entry: the archive is a pure function of its
// content, so an unchanged story rebuilds to a byte-identical zip with an identical sha256.
const DOS_DATE = 0x0021;
const DOS_TIME = 0x0000;
const UTF8_NAME_FLAG = 0x0800;

function zip(contents) {
	const locals = [];
	const centrals = [];
	let offset = 0;

	for (const relative of [...contents.keys()].sort()) {
		const raw = contents.get(relative);
		const deflated = deflateRawSync(raw, { level: 9 });
		// Deflate can exceed the input on tiny/incompressible files; store those verbatim.
		const useDeflate = deflated.length < raw.length;
		const body = useDeflate ? deflated : raw;
		const name = Buffer.from(relative, 'utf8');

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(UTF8_NAME_FLAG, 6);
		local.writeUInt16LE(useDeflate ? 8 : 0, 8);
		local.writeUInt16LE(DOS_TIME, 10);
		local.writeUInt16LE(DOS_DATE, 12);
		local.writeUInt32LE(crc32(raw), 14);
		local.writeUInt32LE(body.length, 18);
		local.writeUInt32LE(raw.length, 22);
		local.writeUInt16LE(name.length, 26);
		locals.push(local, name, body);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(UTF8_NAME_FLAG, 8);
		central.writeUInt16LE(useDeflate ? 8 : 0, 10);
		central.writeUInt16LE(DOS_TIME, 12);
		central.writeUInt16LE(DOS_DATE, 14);
		central.writeUInt32LE(crc32(raw), 16);
		central.writeUInt32LE(body.length, 20);
		central.writeUInt32LE(raw.length, 24);
		central.writeUInt16LE(name.length, 28);
		// External attrs: unix regular file, rw-r--r-- in the high word (`<<16` would overflow
		// JS's signed 32-bit bitwise range, so multiply instead).
		central.writeUInt32LE(0o100644 * 0x10000, 38);
		central.writeUInt32LE(offset, 42);
		centrals.push(central, name);

		offset += local.length + name.length + body.length;
	}

	const centralDirectory = Buffer.concat(centrals);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(contents.size, 8);
	end.writeUInt16LE(contents.size, 10);
	end.writeUInt32LE(centralDirectory.length, 12);
	end.writeUInt32LE(offset, 16);

	return Buffer.concat([...locals, centralDirectory, end]);
}

// --- driver -----------------------------------------------------------------------------

function reportErrors(slug, errors) {
	console.error(`\n✖ ${slug}: ${errors.length} problem(s)`);
	for (const error of errors)
		console.error(`    [${error.code}] ${error.path}\n        ${error.message}`);
}

async function main() {
	let storyDirs;
	try {
		storyDirs = (await readdir(STORIES_DIR, { withFileTypes: true }))
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
	} catch {
		console.error(`No stories/ directory at ${STORIES_DIR}`);
		process.exit(1);
	}

	if (storyDirs.length === 0) {
		console.log('stories/ contains no packages — nothing to do.');
		return;
	}

	// `configFile: false` skips the SvelteKit plugin: this only needs Vite's TS transform and
	// its `.js` -> `.ts` relative-import resolution, not an app build.
	const vite = await createServer({
		configFile: false,
		logLevel: 'warn',
		appType: 'custom',
		server: { middlewareMode: true },
		optimizeDeps: { noDiscovery: true }
	});
	const { validatePackage } = await vite.ssrLoadModule('/src/lib/content/validate-package.ts');

	const built = [];
	let failed = 0;
	try {
		for (const slug of storyDirs) {
			const contents = await readPackage(path.join(STORIES_DIR, slug));
			const { parsed, errors: jsonErrors } = parseJsonFiles(contents);
			const errors = [...jsonErrors];

			if (jsonErrors.length === 0) {
				const result = validatePackage(parsed);
				errors.push(...result.errors);
				if (result.manifest) {
					errors.push(...checkUndeclaredContent(result.manifest, contents));
					errors.push(...checkAssetReferences(result.manifest, parsed, contents));
				}
			}

			if (errors.length > 0) {
				reportErrors(slug, errors);
				failed++;
				continue;
			}

			const manifest = parsed['manifest.json'];
			contents.set(CHECKSUMS_PATH, checksums(contents));
			const archive = zip(contents);
			built.push({
				slug,
				id: manifest.id,
				title: manifest.title,
				version: manifest.version,
				tag: `story-${slug}-v${manifest.version}`,
				zip: `${slug}-v${manifest.version}.zip`,
				bytes: archive.length,
				sha256: sha256(archive),
				fileCount: contents.size,
				archive
			});
		}
	} finally {
		await vite.close();
	}

	if (failed > 0) {
		console.error(`\n${failed} of ${storyDirs.length} story package(s) failed validation.`);
		process.exit(1);
	}

	for (const story of built) {
		console.log(
			`✔ ${story.slug} — ${story.title} v${story.version} · ${story.fileCount} files · ${(story.bytes / 1024).toFixed(1)} KiB`
		);
	}

	if (checkOnly) {
		console.log(`\n${built.length} story package(s) valid (--check: nothing written).`);
		return;
	}

	await rm(OUT_DIR, { recursive: true, force: true });
	await mkdir(OUT_DIR, { recursive: true });
	for (const story of built) {
		await writeFile(path.join(OUT_DIR, story.zip), story.archive);
		// Sidecars are for release verification, not for shipping to a browser — `index.json`
		// already carries the same digest for anything the app would want to check.
		if (!toStatic) {
			await writeFile(path.join(OUT_DIR, `${story.zip}.sha256`), `${story.sha256}  ${story.zip}\n`);
		}
	}
	// Consumed by .github/workflows/stories.yml to decide which releases are still missing, and
	// by `/chat/riddlon` (via `--static`) to offer the bundled packages as installable entries.
	// `archive` is the zip bytes — metadata only in the index.
	const index = built.map((story) =>
		Object.fromEntries(Object.entries(story).filter(([key]) => key !== 'archive'))
	);
	await writeFile(path.join(OUT_DIR, 'index.json'), `${JSON.stringify(index, null, '\t')}\n`);

	console.log(`\nWrote ${built.length} package(s) to ${path.relative(ROOT, OUT_DIR)}/`);
}

await main();
