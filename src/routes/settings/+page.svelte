<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import AppFrame from '$lib/components/chat/AppFrame.svelte';
	import AppHeader from '$lib/components/chat/AppHeader.svelte';
	import InfoBand from '$lib/components/chat/InfoBand.svelte';
	import Avatar from '$lib/components/chat/Avatar.svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { DEFAULT_MODEL_ID, formatSizeLabel, llmModelOptions } from '$lib/llm/catalog.js';
	import {
		clearEndpointConfig,
		endpointHostLabel,
		getEndpointConfig,
		isLocalEndpoint,
		setEndpointConfig
	} from '$lib/llm/endpoint-config.js';
	import { testEndpoint } from '$lib/llm/openai-compatible.js';
	import { i18nKeyForLlmError } from '$lib/llm/errors.js';
	import { llm } from '$lib/llm/llm.svelte.js';
	import { modelRowStatus, type ModelRowKind, type ModelRowStatus } from '$lib/llm/model-status.js';
	import { profile } from '$lib/state/profile.svelte.js';
	import { DISGUISE_MODES, PRONOUN_OPTIONS, addressPreview } from '$lib/state/profile.js';
	import { resetEverything, resetStoryProgress } from '$lib/state/reset.js';

	const preview = $derived(addressPreview(profile.addressAs, profile.nickname));

	// Mirrors `endpoint-config.ts`'s localStorage state as reactive fields, since the store itself is
	// deliberately not a rune (it has to survive a reload without a save/load dance).
	let storedEndpoint = $state(getEndpointConfig());
	let endpointBaseUrl = $state(getEndpointConfig()?.baseUrl ?? '');
	let endpointModel = $state(getEndpointConfig()?.model ?? '');
	let endpointApiKey = $state(getEndpointConfig()?.apiKey ?? '');
	let endpointTestState = $state<
		{ kind: 'idle' } | { kind: 'running' } | { kind: 'ok' } | { kind: 'failed'; message: string }
	>({ kind: 'idle' });

	// Mirror of `parseEndpointConfig`'s rule: both halves are required, or a half-filled form would
	// count as configured and outrank a local model that actually works.
	const endpointComplete = $derived(Boolean(endpointBaseUrl.trim() && endpointModel.trim()));

	function draftEndpoint() {
		return {
			baseUrl: endpointBaseUrl.trim(),
			model: endpointModel.trim(),
			apiKey: endpointApiKey.trim() || undefined
		};
	}

	async function applyEndpointChange(): Promise<void> {
		// Forces the live engine to re-resolve its provider against the new configuration — this is
		// also what drops `provider.ts`'s memo, which is keyed by model id alone and would otherwise
		// keep serving the previous backend until a reload.
		await llm.selectModel(llm.activeModelId ?? DEFAULT_MODEL_ID, { force: true });

		// `selectModel` only tears down; nothing on this screen would load again, so the row would sit
		// on "inaktiv" after saving and give no sign the endpoint took effect. Loading one is free
		// here — an endpoint has no weights to fetch and its `create()` never touches the network.
		// Only on save: after *removing* one, a device with no local backend would fail the load, and
		// an error banner is the wrong answer to "I removed my endpoint".
		if (storedEndpoint) {
			await llm.ensureLoaded(llm.activeModelId ?? DEFAULT_MODEL_ID).catch(() => {});
		}
	}

	async function saveEndpoint(): Promise<void> {
		if (!endpointComplete) return;
		setEndpointConfig(draftEndpoint());
		storedEndpoint = getEndpointConfig();
		endpointBaseUrl = storedEndpoint?.baseUrl ?? endpointBaseUrl;
		endpointTestState = { kind: 'idle' };
		await applyEndpointChange();
	}

	async function clearStoredEndpoint(): Promise<void> {
		clearEndpointConfig();
		storedEndpoint = undefined;
		endpointBaseUrl = '';
		endpointModel = '';
		endpointApiKey = '';
		endpointTestState = { kind: 'idle' };
		await applyEndpointChange();
	}

	// A configured endpoint wins over a working local model, so a typo would otherwise only show up
	// as a silently dead chat on the first message — nothing contacts the address before then.
	async function runEndpointTest(): Promise<void> {
		if (!endpointComplete) return;
		endpointTestState = { kind: 'running' };
		const result = await testEndpoint(draftEndpoint());
		endpointTestState = result.ok
			? { kind: 'ok' }
			: { kind: 'failed', message: t(i18nKeyForLlmError(result.code)) };
	}

	// Read-only status list, not a picker: which *local* model runs is entirely the app's decision
	// (native Prompt API first, else the best WebLLM model this device can hold — see
	// `capabilities.ts`'s `bestSupportedModelId`). Each WebLLM row states its own VRAM requirement
	// (from web-llm's own model list, see catalog.ts) so the detected capacity line above the list
	// means something concrete per row.
	//
	// The endpoint row leads, because display order follows resolve order and a configured endpoint
	// outranks both local backends (see `provider.ts`). Unlike the Gemini row it replaces it is
	// always present, not gated on local inference being a dead end: it is a preference a player may
	// reach for on any device, not a rescue path.
	const modelRows = $derived([
		{
			kind: 'openai' as const,
			label: t('settings.modelEndpointLabel'),
			detail: storedEndpoint
				? t('settings.modelEndpointDetail', {
						model: storedEndpoint.model,
						host: endpointHostLabel(storedEndpoint.baseUrl)
					})
				: t('settings.modelEndpointUnconfigured')
		},
		{ kind: 'native' as const, label: 'Gemini Nano', detail: t('settings.modelNativeDetail') },
		...llmModelOptions().map((option) => ({
			kind: option.id as ModelRowKind,
			label: option.label,
			detail: t('settings.modelWebllmDetail', {
				size: formatSizeLabel(option.approxDownloadBytes),
				vram: formatSizeLabel(option.vramRequiredMB * 1024 * 1024)
			})
		}))
	]);

	// What the device actually reports, so a player can see why the app picked the fallback tier it
	// did — `maxBufferBytes` is the same figure `capabilities.ts`'s VRAM check itself compares
	// against, not total VRAM (browsers don't expose that), so it's phrased as an estimate.
	const availableCapacity = $derived(
		llm.capabilities?.hasWebGpu && llm.capabilities.maxBufferBytes !== undefined
			? formatSizeLabel(llm.capabilities.maxBufferBytes)
			: null
	);

	// Capabilities are normally already known by the time this screen is reached (the boot splash
	// probes them first), but a direct reload of /settings would otherwise leave every row stuck on
	// "wird geprüft" forever.
	$effect(() => {
		if (!llm.capabilities) void llm.detect();
	});

	// Persists every field this screen edits (#18) — reading each one here is what makes the
	// effect re-run on any change; `profile.persist()` itself no-ops until the initial load
	// (stored profile / app settings) has resolved, so this never clobbers a saved profile.
	$effect(() => {
		void profile.nickname;
		void profile.bio;
		void profile.addressAs;
		void profile.disguise;
		void profile.notify;
		profile.persist();
	});

	let customPronoun = $state('');

	function useCustomPronoun(): void {
		const trimmed = customPronoun.trim();
		if (trimmed) profile.addressAs = trimmed;
	}

	function rowStatus(kind: ModelRowKind): ModelRowStatus {
		return modelRowStatus({
			kind,
			backend: llm.backend,
			activeModelId: llm.activeModelId,
			loadingModelId: llm.loadingModelId,
			status: llm.status,
			progress: llm.progress,
			hasNativeLanguageModel: llm.capabilities?.hasNativeLanguageModel,
			unsupportedReason:
				kind === 'native' || kind === 'openai' ? undefined : llm.unsupportedReason(kind),
			hasEndpointConfig: storedEndpoint !== undefined
		});
	}

	/** Right-hand status text for a model row. */
	function statusLabel(status: ModelRowStatus): string {
		switch (status.kind) {
			case 'checking':
				return t('settings.modelChecking');
			case 'unavailable':
				return t('settings.modelUnavailable');
			case 'unsupported':
				return t(
					status.reason === 'no-webgpu'
						? 'settings.modelUnsupportedNoWebgpu'
						: 'settings.modelUnsupportedVram'
				);
			case 'not-configured':
				return t('settings.modelEndpointUnconfigured');
			case 'downloading':
				return t('settings.modelDownloading', { percent: status.percent });
			case 'preparing':
				return t('settings.modelPreparing', { percent: status.percent });
			case 'active':
				return t('settings.modelActive');
			case 'inactive':
				return t('settings.modelInactive');
		}
	}

	type ResetKind = 'progress' | 'all';

	// Two-step confirm instead of `window.confirm`: it's the only irreversible action in the app,
	// and a native dialog is the one piece of chrome the disguise modes can't style.
	let armed = $state<ResetKind | null>(null);
	let running = $state<ResetKind | null>(null);

	async function runReset(kind: ResetKind): Promise<void> {
		if (armed !== kind) {
			armed = kind;
			return;
		}
		armed = null;
		running = kind;
		try {
			if (kind === 'all') await resetEverything();
			else await resetStoryProgress();
		} finally {
			// Full load, not `goto`: the state singletons memoize their init (see `state/reset.ts`),
			// so booting again is what actually shows the cleared state.
			location.href = resolve('/');
		}
	}
</script>

<svelte:head><title>{t('settings.title')} · Riddlon</title></svelte:head>

<AppFrame>
	<AppHeader onBack={() => goto(resolve('/chats'))}>
		<span class="block text-center text-h1 font-medium text-slate-100">{t('settings.title')}</span>
		{#snippet trailing()}
			<span class="font-mono text-caption text-slate-500"
				>{t('settings.version', { version: __APP_VERSION__ })}</span
			>
		{/snippet}
	</AppHeader>

	<InfoBand>
		<span class="font-mono text-[9px] tracking-[0.11em] text-slate-600"
			>{t('settings.scopeNote')}</span
		>
	</InfoBand>

	<div class="min-h-0 flex-1 overflow-y-auto">
		<div class="mx-auto flex w-full max-w-pane flex-col gap-7 px-5.5 pt-5.5 pb-8.5">
			<div class="flex items-center gap-3.5">
				<Avatar kind="cover" size={64} />
				<div class="min-w-0 flex-1">
					<div class="font-mono text-[9.5px] tracking-[0.12em] text-slate-500">
						{t('settings.avatarLabel')}
					</div>
					<input
						bind:value={profile.nickname}
						placeholder={t('settings.nicknamePlaceholder')}
						class="mt-2 w-full rounded-tile border border-line-strong bg-slate-100/5 px-3.5 py-2.5 text-h2 font-medium text-slate-100 placeholder:text-slate-500 focus:border-accent/60 focus:outline-none"
					/>
				</div>
			</div>

			<div>
				<div class="font-mono text-[9.5px] tracking-[0.12em] text-slate-500">
					{t('settings.pronounLabel')}
				</div>
				<div class="mt-2.5 flex flex-wrap gap-2">
					{#each PRONOUN_OPTIONS as option (option)}
						<button
							type="button"
							onclick={() => (profile.addressAs = option)}
							class="rounded-full border px-3.5 py-2 text-label font-medium whitespace-nowrap {profile.addressAs ===
							option
								? 'border-accent bg-accent/18 text-slate-100'
								: 'border-line-strong bg-slate-100/4 text-slate-300'}"
						>
							{option}
						</button>
					{/each}
				</div>
				<div class="mt-2 flex gap-2">
					<input
						bind:value={customPronoun}
						onkeydown={(event) => event.key === 'Enter' && useCustomPronoun()}
						placeholder={t('settings.pronounCustomPlaceholder')}
						class="min-w-0 flex-1 rounded-full border border-line-strong bg-slate-100/4 px-3.5 py-2 text-label text-slate-200 placeholder:text-slate-500 focus:border-accent/60 focus:outline-none"
					/>
					<button
						type="button"
						onclick={useCustomPronoun}
						class="flex-none rounded-full border border-line-strong px-3.5 py-2 text-label font-medium text-slate-200 hover:bg-slate-100/8"
					>
						{t('settings.pronounCustomApply')}
					</button>
				</div>
				<div
					class="mt-3 rounded-tile border border-line bg-surface-raised px-3.5 py-3"
					style="border-radius:12px 12px 12px 4px"
				>
					<div class="font-mono text-[9.5px] tracking-[0.1em] text-slate-500">
						{t('settings.previewLabel', { name: 'LUCY' })}
					</div>
					<div class="mt-1.5 text-body leading-relaxed text-slate-100">
						{t(preview.key, preview.vars)}
					</div>
				</div>
				<textarea
					bind:value={profile.bio}
					placeholder={t('settings.bioPlaceholder')}
					rows="2"
					class="mt-3 w-full resize-none rounded-tile border border-line-strong bg-slate-100/5 px-3.5 py-2.5 text-label leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-accent/60 focus:outline-none"
				></textarea>
			</div>

			<div>
				<div class="font-mono text-[9.5px] tracking-[0.12em] text-slate-500">
					{t('settings.disguiseLabel')}
				</div>
				<p class="mt-1.5 text-label leading-relaxed text-slate-400">{t('settings.disguiseDesc')}</p>
				<div class="mt-3 flex flex-col gap-2.5">
					{#each DISGUISE_MODES as mode (mode)}
						<button
							type="button"
							onclick={() => (profile.disguise = mode)}
							class="w-full rounded-tile border px-4 py-3.5 text-left {profile.disguise === mode
								? 'border-accent bg-accent/12'
								: 'border-line bg-slate-100/3'}"
						>
							<span class="flex items-start gap-3">
								<span
									class="mt-0.5 flex size-4.5 flex-none items-center justify-center rounded-full border-[1.5px] {profile.disguise ===
									mode
										? 'border-accent'
										: 'border-line-strong'}"
								>
									{#if profile.disguise === mode}
										<span class="size-2 rounded-full bg-accent"></span>
									{/if}
								</span>
								<span class="flex-1">
									<span
										class="block text-body font-medium {profile.disguise === mode
											? 'text-slate-100'
											: 'text-slate-200'}">{t(`settings.disguise.${mode}.title`)}</span
									>
									<span
										class="mt-1 block text-label leading-relaxed {profile.disguise === mode
											? 'text-slate-300'
											: 'text-slate-500'}">{t(`settings.disguise.${mode}.desc`)}</span
									>
								</span>
							</span>
						</button>
					{/each}
				</div>
			</div>

			<div>
				<div class="font-mono text-[9.5px] tracking-[0.12em] text-slate-500">
					{t('settings.modelLabel')}
				</div>
				<p class="mt-1.5 text-label leading-relaxed text-slate-400">{t('settings.modelDesc')}</p>
				{#if availableCapacity}
					<p class="mt-1 font-mono text-caption text-slate-500">
						{t('settings.modelAvailableCapacity', { size: availableCapacity })}
					</p>
				{/if}
				<div class="mt-2.5 flex flex-col gap-2">
					{#each modelRows as row (row.kind)}
						{@const status = rowStatus(row.kind)}
						{@const isActive = status.kind === 'active'}
						<div
							class="flex w-full items-center gap-2.5 rounded-tile border px-3.5 py-3 {isActive
								? 'border-success/40 bg-success/10'
								: 'border-line bg-slate-100/3'}"
						>
							<span
								class="size-1.75 flex-none rounded-full {isActive ? 'bg-success' : 'bg-slate-600'}"
							></span>
							<span class="flex-1">
								<span
									class="block text-label font-medium {isActive
										? 'text-slate-100'
										: 'text-slate-400'}">{row.label}</span
								>
								<span class="block text-caption text-slate-500">{row.detail}</span>
							</span>
							<span class="font-mono text-caption {isActive ? 'text-success' : 'text-slate-500'}"
								>{statusLabel(status)}</span
							>
						</div>
					{/each}
				</div>

				<div class="mt-6">
					<div class="font-mono text-[9.5px] tracking-[0.12em] text-slate-500">
						{t('settings.endpointLabel')}
					</div>
					<p class="mt-1.5 text-label leading-relaxed text-slate-400">
						{t('settings.endpointDesc')}
					</p>

					<div
						class="mt-2.5 rounded-tile border border-line bg-surface-raised px-3.5 py-3.5"
						style="border-radius:12px 12px 12px 4px"
					>
						{#if llm.localUnusable}
							<p class="mb-2.5 text-label leading-relaxed text-slate-300">
								{t('settings.endpointNoteLocalUnusable')}
							</p>
						{/if}

						<label class="block">
							<span class="block text-caption text-slate-500">
								{t('settings.endpointBaseUrlLabel')}
							</span>
							<input
								type="url"
								inputmode="url"
								autocomplete="off"
								spellcheck="false"
								bind:value={endpointBaseUrl}
								placeholder={t('settings.endpointBaseUrlPlaceholder')}
								class="mt-1 w-full rounded-control border border-line-strong bg-slate-100/5 px-3.5 py-2.5 text-label text-slate-100 placeholder:text-slate-500 focus:border-accent/60 focus:outline-none"
							/>
						</label>

						<label class="mt-2.5 block">
							<span class="block text-caption text-slate-500">
								{t('settings.endpointModelLabel')}
							</span>
							<input
								type="text"
								autocomplete="off"
								spellcheck="false"
								bind:value={endpointModel}
								placeholder={t('settings.endpointModelPlaceholder')}
								class="mt-1 w-full rounded-control border border-line-strong bg-slate-100/5 px-3.5 py-2.5 text-label text-slate-100 placeholder:text-slate-500 focus:border-accent/60 focus:outline-none"
							/>
						</label>

						<label class="mt-2.5 block">
							<span class="block text-caption text-slate-500">
								{t('settings.endpointApiKeyLabel')}
							</span>
							<input
								type="password"
								autocomplete="off"
								bind:value={endpointApiKey}
								placeholder={t('settings.endpointApiKeyPlaceholder')}
								class="mt-1 w-full rounded-control border border-line-strong bg-slate-100/5 px-3.5 py-2.5 text-label text-slate-100 placeholder:text-slate-500 focus:border-accent/60 focus:outline-none"
							/>
						</label>

						<div class="mt-3 flex flex-wrap gap-2">
							<button
								type="button"
								onclick={() => void saveEndpoint()}
								disabled={!endpointComplete}
								class="rounded-control border border-accent/60 bg-accent/18 px-3.5 py-2.5 text-label font-medium text-slate-100 disabled:opacity-50"
							>
								{t('settings.endpointSave')}
							</button>
							<button
								type="button"
								onclick={() => void runEndpointTest()}
								disabled={!endpointComplete || endpointTestState.kind === 'running'}
								class="rounded-control border border-line-strong px-3.5 py-2.5 text-label font-medium text-slate-300 disabled:opacity-50"
							>
								{endpointTestState.kind === 'running'
									? t('settings.endpointTestRunning')
									: t('settings.endpointTest')}
							</button>
						</div>

						{#if endpointTestState.kind === 'ok'}
							<p class="mt-2 text-label text-success">{t('settings.endpointTestOk')}</p>
						{:else if endpointTestState.kind === 'failed'}
							<p class="mt-2 text-label text-danger">{endpointTestState.message}</p>
						{/if}

						{#if endpointComplete}
							<p class="mt-2.5 text-label leading-relaxed text-slate-400">
								{isLocalEndpoint(endpointBaseUrl)
									? t('settings.endpointNoteLocal', { host: endpointHostLabel(endpointBaseUrl) })
									: t('settings.endpointNoteRemote', { host: endpointHostLabel(endpointBaseUrl) })}
							</p>
						{/if}
						<p class="mt-1.5 text-caption leading-relaxed text-slate-500">
							{t('settings.endpointCorsHint')}
						</p>

						{#if storedEndpoint}
							<button
								type="button"
								onclick={() => void clearStoredEndpoint()}
								class="mt-2.5 text-label font-medium text-slate-400 hover:text-slate-200"
							>
								{t('settings.endpointClear')}
							</button>
						{/if}
					</div>
				</div>

				<button
					type="button"
					onclick={() => (profile.notify = !profile.notify)}
					class="mt-3 flex w-full items-center gap-3 py-3.5 text-left"
				>
					<span class="flex-1">
						<span class="block text-label font-medium text-slate-100"
							>{t('settings.notifyTitle')}</span
						>
						<span class="mt-1 block text-caption leading-relaxed text-slate-500"
							>{t('settings.notifyDesc')}</span
						>
					</span>
					<span
						class="flex h-6.5 w-10.5 flex-none items-center rounded-full p-0.75 {profile.notify
							? 'justify-end bg-accent'
							: 'justify-start bg-slate-100/13'}"
					>
						<span class="size-5 rounded-full {profile.notify ? 'bg-white' : 'bg-slate-400'}"></span>
					</span>
				</button>
			</div>

			<div>
				<div class="font-mono text-[9.5px] tracking-[0.12em] text-slate-500">
					{t('settings.resetLabel')}
				</div>
				<p class="mt-1.5 text-label leading-relaxed text-slate-400">{t('settings.resetDesc')}</p>
				<div class="mt-3 flex flex-col gap-2.5">
					{#each [{ kind: 'progress' as const, danger: false }, { kind: 'all' as const, danger: true }] as action (action.kind)}
						<div
							class="rounded-tile border px-4 py-3.5 {armed === action.kind
								? 'border-danger bg-danger/10'
								: 'border-line bg-slate-100/3'}"
						>
							<div class="text-body font-medium {action.danger ? 'text-danger' : 'text-slate-100'}">
								{action.kind === 'all'
									? t('settings.resetAllTitle')
									: t('settings.resetProgressTitle')}
							</div>
							<p class="mt-1 text-label leading-relaxed text-slate-500">
								{action.kind === 'all'
									? t('settings.resetAllDesc')
									: t('settings.resetProgressDesc')}
							</p>
							{#if armed === action.kind}
								<p class="mt-2 text-label font-medium text-danger">{t('settings.resetConfirm')}</p>
							{/if}
							<div class="mt-3 flex gap-2.5">
								<button
									type="button"
									disabled={running !== null}
									onclick={() => void runReset(action.kind)}
									class="flex-1 rounded-control border px-3 py-2.5 text-label font-medium disabled:opacity-50 {armed ===
									action.kind
										? 'border-danger bg-danger/20 text-slate-100'
										: 'border-line-strong text-slate-200 hover:bg-slate-100/8'}"
								>
									{running === action.kind
										? t('settings.resetRunning')
										: action.kind === 'all'
											? t('settings.resetAllTitle')
											: t('settings.resetProgressTitle')}
								</button>
								{#if armed === action.kind}
									<button
										type="button"
										onclick={() => (armed = null)}
										class="flex-none rounded-control border border-line-strong px-3 py-2.5 text-label font-medium text-slate-300 hover:bg-slate-100/8"
									>
										{t('settings.resetCancel')}
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
				<p class="mt-2.5 text-caption leading-relaxed text-slate-600">
					{t('settings.resetModelNote')}
				</p>
			</div>
		</div>
	</div>
</AppFrame>
