<script lang="ts">
	/**
	 * Dev-only harness for the ZIP/URL story-package importer (#zip-import, #url-import).
	 *
	 * The conversational import UX in `/chat/riddlon` is still decorative (#ui-riddlon-chat
	 * hasn't landed), so this is where the pipeline in `$lib/content/{unzip,install-package,
	 * zip-import,url-import}.ts` gets exercised against a real browser (IndexedDB + Cache
	 * Storage aren't available in the Node test environment). Not linked from anywhere in the app.
	 *
	 * Delete this route once #ui-riddlon-chat wires the "ZIP wählen"/"URL einfügen" buttons.
	 */
	import {
		importPackageFromZipFile,
		importPackageFromUrl,
		type ImportResult
	} from '$lib/content/index.js';
	import { storyRegistry, type InstalledPackageSummary } from '$lib/storage/index.js';

	let url = $state('');
	let busy = $state(false);
	let lastResult = $state<ImportResult | null>(null);
	let installed = $state<InstalledPackageSummary[]>([]);

	async function refresh() {
		installed = await storyRegistry.list();
	}

	void refresh();

	async function onFileChosen(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		busy = true;
		lastResult = null;
		try {
			lastResult = await importPackageFromZipFile(file);
		} finally {
			busy = false;
			(event.target as HTMLInputElement).value = '';
			await refresh();
		}
	}

	async function onImportUrl() {
		if (!url) return;
		busy = true;
		lastResult = null;
		try {
			lastResult = await importPackageFromUrl(url);
		} finally {
			busy = false;
			await refresh();
		}
	}

	async function onUninstall(id: string) {
		await storyRegistry.uninstall(id);
		await refresh();
	}
</script>

<svelte:head><title>Import-Harness · Riddlon</title></svelte:head>

<div class="mx-auto flex max-w-pane flex-col gap-5 p-6 text-slate-200">
	<header class="flex flex-col gap-1">
		<h1 class="font-serif text-2xl text-slate-50">Import-Harness</h1>
		<p class="text-caption text-slate-500">
			Entwickler-Werkzeug für <code>$lib/content</code> ZIP-/URL-Import. Nicht Teil des Spiels.
		</p>
	</header>

	<section class="flex flex-col gap-2 rounded-tile border border-line bg-slate-100/3 p-4">
		<h2 class="font-mono text-[9.5px] tracking-[0.12em] text-slate-500">ZIP WÄHLEN</h2>
		<input
			type="file"
			accept=".zip,application/zip"
			disabled={busy}
			onchange={(event) => void onFileChosen(event)}
			class="text-label"
		/>
	</section>

	<section class="flex flex-col gap-2 rounded-tile border border-line bg-slate-100/3 p-4">
		<h2 class="font-mono text-[9.5px] tracking-[0.12em] text-slate-500">URL EINFÜGEN</h2>
		<div class="flex gap-2">
			<input
				type="url"
				bind:value={url}
				disabled={busy}
				placeholder="https://…/package.zip"
				class="flex-1 rounded-tile border border-line bg-slate-100/3 p-2 text-body"
			/>
			<button
				type="button"
				onclick={() => void onImportUrl()}
				disabled={busy || !url}
				class="rounded-tile border border-accent bg-accent/12 px-3.5 py-2 text-label disabled:opacity-50"
			>
				Importieren
			</button>
		</div>
		<p class="text-caption text-slate-500">
			Wird einmalig heruntergeladen und lokal installiert. Danach kein Netz nötig.
		</p>
	</section>

	{#if lastResult}
		<section class="flex flex-col gap-1 rounded-tile border border-line bg-slate-100/3 p-4">
			<h2 class="font-mono text-[9.5px] tracking-[0.12em] text-slate-500">LETZTES ERGEBNIS</h2>
			{#if lastResult.ok}
				<p class="text-body text-success">
					„{lastResult.summary.title}“ installiert · {(
						lastResult.summary.sizeBytes / 1_000_000
					).toFixed(1)} MB · {lastResult.summary.characterIds.length} Charaktere
				</p>
			{:else}
				{#each lastResult.errors as error (error.code + (error.path ?? ''))}
					<p class="font-mono text-caption text-danger">
						{error.code}{error.path ? ` (${error.path})` : ''} — {error.message}
					</p>
				{/each}
			{/if}
		</section>
	{/if}

	<section class="flex flex-col gap-2">
		<h2 class="font-mono text-[9.5px] tracking-[0.12em] text-slate-500">
			INSTALLIERT ({installed.length})
		</h2>
		{#each installed as pkg (pkg.id)}
			<div
				class="flex items-center justify-between gap-2 rounded-tile border border-line bg-slate-100/3 px-3.5 py-2"
			>
				<span class="text-label">
					{pkg.title} · v{pkg.version} · {(pkg.sizeBytes / 1_000_000).toFixed(1)} MB · {pkg
						.characterIds.length} Charaktere
				</span>
				<button
					type="button"
					onclick={() => void onUninstall(pkg.id)}
					class="rounded-tile border border-line px-2.5 py-1 text-caption text-slate-400"
				>
					entfernen
				</button>
			</div>
		{:else}
			<p class="text-caption text-slate-500">Noch keine Story installiert.</p>
		{/each}
	</section>
</div>
