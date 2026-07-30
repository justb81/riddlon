<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import AppFrame from '$lib/components/chat/AppFrame.svelte';
	import AppHeader from '$lib/components/chat/AppHeader.svelte';
	import InfoBand from '$lib/components/chat/InfoBand.svelte';
	import Avatar from '$lib/components/chat/Avatar.svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { formatSizeLabel, llmModelOptions, type LocalModelId } from '$lib/llm/catalog.js';
	import { llm } from '$lib/llm/llm.svelte.js';
	import { profile } from '$lib/state/profile.svelte.js';
	import { DISGUISE_MODES, PRONOUN_OPTIONS, addressPreview } from '$lib/state/profile.js';
	import { resetEverything, resetStoryProgress } from '$lib/state/reset.js';

	const preview = $derived(addressPreview(profile.addressAs, profile.nickname));

	// The built-in model needs no download at all, so when the browser has one the WebLLM entries are
	// an explicit override rather than the normal path — the picker must not imply a download that
	// would never happen.
	const usingBuiltIn = $derived(llm.backend === 'native');

	$effect(() => {
		void llm.refreshCacheState();
	});

	// Persists every field this screen edits (#18) — reading each one here is what makes the
	// effect re-run on any change; `profile.persist()` itself no-ops until the initial load
	// (stored profile / app settings) has resolved, so this never clobbers a saved profile.
	$effect(() => {
		void profile.nickname;
		void profile.bio;
		void profile.addressAs;
		void profile.disguise;
		void profile.model;
		void profile.notify;
		profile.persist();
	});

	let customPronoun = $state('');

	function useCustomPronoun(): void {
		const trimmed = customPronoun.trim();
		if (trimmed) profile.addressAs = trimmed;
	}

	/** Right-hand status for a model row: cached, unsupported, still being probed, or not yet local. */
	function statusKey(id: LocalModelId): string {
		if (usingBuiltIn) return 'settings.modelBuiltIn';
		if (!llm.canRun(id)) return 'settings.modelUnsupported';
		const cached = llm.cached[id];
		if (cached === undefined) return 'settings.modelChecking';
		return cached ? 'settings.modelLoaded' : 'settings.modelNotLoaded';
	}

	async function pickModel(id: LocalModelId) {
		if (profile.model === id) return;
		profile.model = id;
		// Tears down the live engine so the next load picks up the newly chosen weights.
		await llm.selectModel(id);
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
				>{t('settings.version', { version: '0.1' })}</span
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
				<div class="mt-2.5 flex flex-col gap-2">
					{#each llmModelOptions() as option (option.id)}
						<button
							type="button"
							onclick={() => void pickModel(option.id)}
							class="flex w-full items-center gap-2.5 rounded-tile border px-3.5 py-3 text-left {profile.model ===
							option.id
								? 'border-accent bg-accent/12'
								: 'border-line bg-slate-100/3'}"
						>
							<span
								class="size-1.75 flex-none rounded-full {profile.model === option.id
									? 'bg-accent'
									: 'bg-slate-600'}"
							></span>
							<span
								class="flex-1 text-label font-medium {profile.model === option.id
									? 'text-slate-100'
									: 'text-slate-300'}">{option.label}</span
							>
							<span class="font-mono text-caption text-slate-500"
								>{formatSizeLabel(option.approxDownloadBytes)} · {t(statusKey(option.id))}</span
							>
						</button>
					{/each}
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
