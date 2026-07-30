<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RiddlonMark from '$lib/components/icons/RiddlonMark.svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { findModel } from '$lib/llm/catalog.js';
	import { llm } from '$lib/llm/llm.svelte.js';
	import { profile } from '$lib/state/profile.svelte.js';
	import { storySession } from '$lib/state/story-session.svelte.js';
	import { hasOnboarded, markOnboarded } from '$lib/state/onboarding.js';
	import {
		bootStepFor,
		bootStepSpanMs,
		warmBootSteps,
		type BootStep
	} from '$lib/story/boot-steps.js';

	// `hasOnboarded()` is synchronous, so it decides which layout paints first. Whether this really
	// is a first run is settled a moment later by asking whether the model is on the device: the flag
	// alone would misclassify someone whose download failed last time as a warm start.
	let firstRun = $state(!hasOnboarded());
	let percent = $state(0);
	let currentStep = $state<BootStep | null>(null);
	let awaitingConsent = $state(false);

	const model = $derived(findModel(profile.model));

	let timers: ReturnType<typeof setTimeout>[] = [];
	const abort = new AbortController();

	onMount(() => {
		void boot();
		return () => {
			timers.forEach(clearTimeout);
			abort.abort();
		};
	});

	async function boot() {
		currentStep = bootStepFor({ kind: 'checking' });
		await llm.detect();
		if (llm.status === 'error') {
			showError();
			return;
		}

		firstRun = !(await llm.isModelCached(profile.model));
		if (!firstRun) {
			runWarmSequence();
			return;
		}

		if (!llm.mayAutoDownload) {
			// Metered or data-saving connection — a ~2 GB download is not something to start unasked.
			awaitingConsent = true;
			currentStep = bootStepFor({ kind: 'consent', model });
			return;
		}

		await runFirstRun();
	}

	function runWarmSequence() {
		// Fire-and-forget: a returning player's package/save already exist, so this resolves
		// almost immediately, but `/chats` shouldn't have to wait for it to start loading.
		void storySession.init();

		const steps = warmBootSteps();
		const span = bootStepSpanMs();
		currentStep = steps[0] ?? null;

		timers = steps.map((step, i) =>
			setTimeout(() => {
				percent = step.percent;
				currentStep = step;
			}, i * span)
		);
		timers.push(setTimeout(finish, steps.length * span + 300));
	}

	async function runFirstRun() {
		awaitingConsent = false;
		percent = 0;
		currentStep = bootStepFor({ kind: 'model-load', fraction: 0, model });

		try {
			await llm.ensureLoaded(profile.model, { signal: abort.signal });
		} catch {
			showError(); // llm.errorCode already carries the classified reason.
			return;
		}
		if (abort.signal.aborted) return;

		const loading = bootStepFor({ kind: 'library-load' });
		percent = loading.percent;
		currentStep = loading;
		try {
			// Reads the local library and resumes the active package. On a genuinely first run this
			// finds nothing — the library stays empty until the player imports a story, which is
			// the only way content ever enters the app (docs/concept.md §4.1).
			await storySession.init();
		} catch {
			// A failed library read shouldn't strand the player on the splash screen — `/chats`
			// surfaces the gap instead of a silent retry loop here.
		}
		finish();
	}

	function showError() {
		percent = 0;
		currentStep = bootStepFor({ kind: 'error', code: llm.errorCode ?? 'unknown' });
	}

	function retry() {
		llm.reset();
		void runFirstRun();
	}

	/** Degraded mode: the library and case file still work, chat replies don't — every message in
	 *  a story now comes from the local model, so the conversation screens say so. */
	function continueWithoutLlm() {
		void goto(resolve('/chats'));
	}

	function finish() {
		const done = bootStepFor({ kind: 'done' });
		percent = done.percent;
		currentStep = done;
		markOnboarded();
		void goto(resolve('/chats'));
	}

	// The adapter reports progress into the store; mirror it onto the bar as it arrives.
	$effect(() => {
		if (llm.status !== 'downloading' && llm.status !== 'preparing') return;
		const step = bootStepFor({ kind: 'model-load', fraction: llm.progress, model });
		percent = step.percent;
		currentStep = step;
	});
</script>

<svelte:head><title>Riddlon</title></svelte:head>

<div class="relative flex h-dvh flex-col items-center justify-center overflow-hidden bg-surface">
	<div
		class="pointer-events-none absolute inset-0"
		style="background:radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--color-accent) 14%, transparent) 0%, transparent 62%)"
	></div>

	<div class="relative flex items-center justify-center">
		<div
			class="absolute size-[190px] rounded-full border border-dashed border-accent/40"
			style="animation:rd-ring 22s linear infinite"
		></div>
		<div style="animation:rd-pop .6s ease both">
			<RiddlonMark size={104} />
		</div>
	</div>

	<div class="relative mt-8.5 font-serif text-4xl text-slate-50">Riddlon</div>
	<div class="relative mt-3 font-mono text-[11.5px] tracking-[0.14em] text-slate-500">
		{t('boot.tagline')}
	</div>

	<!-- Anchored to the bottom of the viewport on a phone, but capped and centred so it
	     doesn't stretch into a 2000px-wide progress bar on a desktop monitor. -->
	<div class="absolute inset-x-8.5 bottom-14 mx-auto flex max-w-[26rem] flex-col gap-3.5">
		{#if llm.status === 'error'}
			<span class="font-mono text-[10.5px] tracking-[0.12em] text-slate-500"
				>{t('boot.setupLabel')}</span
			>
			<div class="text-body leading-relaxed text-slate-400">
				{currentStep ? t(currentStep.i18nKey, currentStep.vars) : ''}
			</div>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					onclick={retry}
					class="rounded-tile border border-accent bg-accent/12 px-3.5 py-2 text-label font-medium text-slate-100"
				>
					{t('boot.retry')}
				</button>
				<button
					type="button"
					onclick={continueWithoutLlm}
					class="rounded-tile border border-line bg-slate-100/3 px-3.5 py-2 text-label text-slate-300"
				>
					{t('boot.continueWithoutLlm')}
				</button>
			</div>
		{:else if awaitingConsent}
			<span class="font-mono text-[10.5px] tracking-[0.12em] text-slate-500"
				>{t('boot.setupLabel')}</span
			>
			<div class="text-body leading-relaxed text-slate-400">
				{currentStep ? t(currentStep.i18nKey, currentStep.vars) : ''}
			</div>
			<div class="font-mono text-[10px] tracking-[0.06em] text-slate-600">
				{t('boot.setupOfflineNote')}
			</div>
			<button
				type="button"
				onclick={() => void runFirstRun()}
				class="self-start rounded-tile border border-accent bg-accent/12 px-3.5 py-2 text-label font-medium text-slate-100"
			>
				{t('boot.consentStart')}
			</button>
		{:else if firstRun}
			<div class="flex items-baseline justify-between gap-2.5">
				<span class="font-mono text-[10.5px] tracking-[0.12em] text-slate-500"
					>{t('boot.setupLabel')}</span
				>
				<span class="font-mono text-[10.5px] text-accent">{percent} %</span>
			</div>
			<div class="h-[3px] overflow-hidden rounded-full bg-slate-100/12">
				<div
					class="h-full bg-accent transition-[width] duration-400 ease-linear"
					style="width:{percent}%"
				></div>
			</div>
			<div class="text-body leading-relaxed text-slate-400">
				{currentStep ? t(currentStep.i18nKey, currentStep.vars) : ''}
			</div>
			<div class="font-mono text-[10px] tracking-[0.06em] text-slate-600">
				{t('boot.setupOfflineNote')}
			</div>
		{:else}
			<div class="flex items-center justify-center gap-2.5">
				<span
					class="size-1.5 rounded-full bg-accent"
					style="animation:rd-dot 1.1s ease-in-out infinite"
				></span>
				<span
					class="size-1.5 rounded-full bg-accent"
					style="animation:rd-dot 1.1s ease-in-out .18s infinite"
				></span>
				<span
					class="size-1.5 rounded-full bg-accent"
					style="animation:rd-dot 1.1s ease-in-out .36s infinite"
				></span>
				<span class="ml-1 font-mono text-[10.5px] tracking-[0.1em] text-slate-500">
					{currentStep ? t(currentStep.i18nKey, currentStep.vars) : ''}
				</span>
			</div>
		{/if}
	</div>
</div>
