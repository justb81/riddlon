<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RiddlonMark from '$lib/components/icons/RiddlonMark.svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { hasOnboarded, markOnboarded } from '$lib/state/onboarding.js';
	import { bootSteps, bootStepSpanMs, type BootStep } from '$lib/story/boot-steps.js';

	let firstRun = $state(true);
	let percent = $state(0);
	let currentStep = $state<BootStep | null>(null);

	onMount(() => {
		firstRun = !hasOnboarded();
		const steps = bootSteps(firstRun);
		const span = bootStepSpanMs(firstRun);
		currentStep = steps[0] ?? null;

		const timers = steps.map((step, i) =>
			setTimeout(() => {
				percent = step.percent;
				currentStep = step;
			}, i * span)
		);
		timers.push(
			setTimeout(
				() => {
					markOnboarded();
					void goto(resolve('/chats'));
				},
				steps.length * span + 300
			)
		);

		return () => timers.forEach(clearTimeout);
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
		{#if firstRun}
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
