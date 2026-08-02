<script lang="ts">
	/**
	 * Dev-only harness for the local LLM adapter.
	 *
	 * It exists because issue #12's second acceptance criterion — "a full run with no network after
	 * the model is cached completes an in-story conversation turn" — has nowhere else to happen yet:
	 * the story engine (#7) and the conversation view (#15) don't exist, and CI has no GPU, so this
	 * has to be driven by hand in a real browser. Not linked from anywhere in the app.
	 *
	 * Delete this route once #15 streams real replies through `llm.session()`.
	 */
	import {
		DEFAULT_MODEL_ID,
		llmModelOptions,
		formatSizeLabel,
		type LocalModelId
	} from '$lib/llm/catalog.js';
	import { i18nKeyForLlmError } from '$lib/llm/errors.js';
	import { llm } from '$lib/llm/llm.svelte.js';
	import { isForcingWebLlm, setForceWebLlm } from '$lib/llm/provider.js';
	import { t } from '$lib/i18n/i18n.svelte.js';

	const SYSTEM_PROMPT =
		'Du bist Lucy, 28, aus einer Kriminalgeschichte. Antworte kurz, in der Ich-Form, auf Deutsch.';

	// Manual override for testing — unlike the player-facing settings screen (which is read-only:
	// the app always picks native-first / best-fit automatically), this harness exists specifically
	// to force a particular catalog model regardless of what the device would auto-select.
	let selectedModel = $state<LocalModelId>(DEFAULT_MODEL_ID);

	// Bypasses the native Prompt API (Gemini Nano) so the WebLLM path can be exercised on
	// a device where native would otherwise always win — see issue #69's step 1 (measuring
	// `resetChat()` timing needs a real WebLLM session, not native's already-cheap per-session
	// handle). Forces a fresh provider resolution and reloads the currently selected model.
	let forceWebLlm = $state(isForcingWebLlm());

	async function toggleForceWebLlm() {
		forceWebLlm = !forceWebLlm;
		setForceWebLlm(forceWebLlm);
		await llm.selectModel(selectedModel, { force: true });
	}

	let input = $state('Wo warst du gegen acht?');
	let answer = $state('');
	let streaming = $state(false);
	let elapsedMs = $state<number | null>(null);
	let thrown = $state<string | null>(null);

	let controller: AbortController | undefined;

	$effect(() => {
		void llm.refreshCacheState();
	});

	async function load() {
		thrown = null;
		try {
			await llm.ensureLoaded(selectedModel);
		} catch (error) {
			thrown = error instanceof Error ? error.message : String(error);
		}
	}

	async function send() {
		thrown = null;
		answer = '';
		elapsedMs = null;
		streaming = true;
		controller = new AbortController();
		const startedAt = performance.now();

		try {
			const session = await llm.session('dev-harness', { systemPrompt: SYSTEM_PROMPT });
			for await (const delta of session.stream(input, { signal: controller.signal })) {
				answer += delta;
			}
			elapsedMs = Math.round(performance.now() - startedAt);
		} catch (error) {
			thrown = error instanceof Error ? error.message : String(error);
		} finally {
			streaming = false;
			controller = undefined;
		}
	}

	function abort() {
		controller?.abort();
	}

	async function switchModel(id: LocalModelId) {
		selectedModel = id;
		await llm.selectModel(id);
	}
</script>

<svelte:head><title>LLM-Harness · Riddlon</title></svelte:head>

<div class="mx-auto flex max-w-pane flex-col gap-5 p-6 text-slate-200">
	<header class="flex flex-col gap-1">
		<h1 class="font-serif text-2xl text-slate-50">LLM-Harness</h1>
		<p class="text-caption text-slate-500">
			Entwickler-Werkzeug für <code>$lib/llm</code>. Nicht Teil des Spiels.
		</p>
	</header>

	<section class="flex flex-col gap-2 rounded-tile border border-line bg-slate-100/3 p-4">
		<dl class="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-caption">
			<dt class="text-slate-500">status</dt>
			<dd>{llm.status}</dd>
			<dt class="text-slate-500">backend</dt>
			<dd>{llm.backend ?? '—'}</dd>
			<dt class="text-slate-500">progress</dt>
			<dd>{Math.round(llm.progress * 100)} %</dd>
			<dt class="text-slate-500">active model</dt>
			<dd>{llm.activeModelId ?? '—'}</dd>
			<dt class="text-slate-500">webgpu</dt>
			<dd>{llm.capabilities ? String(llm.capabilities.hasWebGpu) : '?'}</dd>
			<dt class="text-slate-500">built-in api</dt>
			<dd>{llm.capabilities ? String(llm.capabilities.hasNativeLanguageModel) : '?'}</dd>
			<dt class="text-slate-500">metered</dt>
			<dd>
				{llm.capabilities?.metered === undefined ? 'unbekannt' : String(llm.capabilities.metered)}
			</dd>
			<dt class="text-slate-500">online</dt>
			<dd>{typeof navigator === 'undefined' ? '?' : String(navigator.onLine)}</dd>
		</dl>

		{#if llm.errorCode}
			<p class="text-caption text-danger">
				{llm.errorCode} — {t(i18nKeyForLlmError(llm.errorCode))}
			</p>
		{/if}
	</section>

	<section class="flex flex-col gap-2 rounded-tile border border-line bg-slate-100/3 p-4">
		<label class="flex items-center gap-2.5 text-label">
			<input type="checkbox" checked={forceWebLlm} onchange={() => void toggleForceWebLlm()} />
			WebLLM erzwingen (native Prompt API / Gemini Nano umgehen)
		</label>
		<p class="text-caption text-slate-500">
			Für #69: misst reale WebLLM-Session-Kosten statt der ohnehin billigen nativen Session. Setzt
			den Provider zurück und lädt das aktuell gewählte Modell neu.
		</p>
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="font-mono text-[9.5px] tracking-[0.12em] text-slate-500">MODELL</h2>
		{#each llmModelOptions() as option (option.id)}
			<button
				type="button"
				onclick={() => void switchModel(option.id)}
				class="flex items-center gap-2.5 rounded-tile border px-3.5 py-3 text-left {selectedModel ===
				option.id
					? 'border-accent bg-accent/12'
					: 'border-line bg-slate-100/3'}"
			>
				<span class="flex-1 text-label">{option.label}</span>
				<span class="font-mono text-caption text-slate-500">
					{formatSizeLabel(option.approxDownloadBytes)} · {option.mlcModelId} · {llm.cached[
						option.id
					] === undefined
						? '?'
						: llm.cached[option.id]
							? 'cached'
							: 'nicht lokal'}
				</span>
			</button>
		{/each}
	</section>

	<section class="flex flex-col gap-2">
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				onclick={() => void load()}
				class="rounded-tile border border-line bg-slate-100/3 px-3.5 py-2 text-label"
			>
				Modell laden
			</button>
			<button
				type="button"
				onclick={() => void send()}
				disabled={streaming}
				class="rounded-tile border border-accent bg-accent/12 px-3.5 py-2 text-label disabled:opacity-50"
			>
				Senden
			</button>
			<button
				type="button"
				onclick={abort}
				disabled={!streaming}
				class="rounded-tile border border-line bg-slate-100/3 px-3.5 py-2 text-label disabled:opacity-50"
			>
				Abbrechen
			</button>
		</div>

		<label class="flex flex-col gap-1">
			<span class="font-mono text-[9.5px] tracking-[0.12em] text-slate-500">PROMPT</span>
			<textarea
				bind:value={input}
				rows="2"
				class="rounded-tile border border-line bg-slate-100/3 p-3 text-body"></textarea>
		</label>
	</section>

	<section class="flex flex-col gap-1">
		<h2 class="font-mono text-[9.5px] tracking-[0.12em] text-slate-500">
			ANTWORT {#if elapsedMs !== null}· {elapsedMs} ms{/if}
		</h2>
		<pre
			class="min-h-24 rounded-tile border border-line bg-slate-100/3 p-3 text-body whitespace-pre-wrap">{answer}</pre>
		{#if thrown}
			<p class="text-caption text-danger">{thrown}</p>
		{/if}
	</section>
</div>
