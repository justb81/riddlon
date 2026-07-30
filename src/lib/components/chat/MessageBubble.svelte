<script lang="ts">
	import Avatar from './Avatar.svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { storyRuntime } from '$lib/state/engine.svelte.js';
	import { type ChatMessage } from '$lib/story/types.js';

	let {
		message,
		speakerName = '',
		showName = false,
		open = false,
		onToggleFlag
	}: {
		message: ChatMessage;
		/** Resolved from the active package's cast by the caller — this component knows no
		 *  characters of its own. */
		speakerName?: string;
		showName?: boolean;
		open?: boolean;
		onToggleFlag?: () => void;
	} = $props();

	/** Real `EngineState.clues[...].claims`; the message only carries the clue reference (#35).
	 *  Shown only while the contradiction is actually open, so a settled case stops flagging it. */
	const clueDisplay = $derived(
		message.clueId ? storyRuntime.clueDisplays[message.clueId] : undefined
	);
	const showContradiction = $derived(!!clueDisplay?.conflicting && !clueDisplay.resolved);
</script>

{#if message.from === 'system'}
	<div
		class="my-2.5 max-w-[80%] self-center rounded-control bg-slate-100/6 px-3 py-1.5 text-center font-mono text-[10.5px] leading-snug text-slate-400 sm:max-w-[68%] lg:max-w-[60%]"
	>
		{message.text}
	</div>
{:else if message.from === 'me'}
	<div
		class="mt-1.5 max-w-[78%] self-end sm:max-w-[72%] lg:max-w-[68%]"
		style="animation:rd-in .26s ease both"
	>
		<div
			style="border-radius:16px 16px 4px 16px"
			class="bg-accent px-3.5 pt-2.5 pb-2.5 text-body leading-relaxed text-white"
		>
			{message.text}
		</div>
		<div class="mt-1 text-right font-mono text-[9.5px] text-slate-500">{message.time} ✓✓</div>
	</div>
{:else}
	<div
		class="mt-1.5 max-w-[80%] self-start sm:max-w-[74%] lg:max-w-[68%]"
		style="animation:rd-in .26s ease both"
	>
		{#if showName && speakerName}
			<div class="mb-1.5 flex items-center gap-1.5 pl-0.5">
				<Avatar
					kind="solo"
					initial={speakerName.slice(0, 1).toUpperCase()}
					size={20}
					fontSize={9.5}
				/>
				<span class="text-label font-medium text-slate-400">{speakerName}</span>
			</div>
		{/if}
		<div
			style="border-radius:16px 16px 16px 4px"
			class="border border-line bg-surface-raised px-3.5 pt-2.5 pb-2.5"
		>
			<div class="text-body leading-relaxed text-slate-100">{message.text}</div>
			{#if showContradiction && clueDisplay}
				<button
					type="button"
					onclick={onToggleFlag}
					class="mt-2.5 flex w-full items-center gap-2 rounded-control border border-accent/45 bg-accent/12 px-2.5 py-1.5 text-left"
				>
					<span
						class="flex size-3.5 flex-none items-center justify-center rounded-full bg-accent text-[9px] font-medium text-white"
						>!</span
					>
					<span class="flex-1 font-mono text-[10.5px] font-medium tracking-wide text-accent-soft"
						>{t('convo.contradictionPrefix', { label: clueDisplay.clueLabel })}</span
					>
					<span class="text-label text-accent-soft/70">{open ? '▾' : '▸'}</span>
				</button>
				{#if open}
					<div class="mt-2 rounded-control bg-surface-sunken/60 p-3">
						<div class="flex flex-col gap-2">
							{#each clueDisplay.sources as source (source.characterId + source.value)}
								<div class="flex items-start gap-2">
									<span class="w-[3px] flex-none self-stretch rounded-full bg-accent"></span>
									<span class="flex-1">
										<span class="block text-label font-medium text-slate-200">{source.who}</span>
										<span class="mt-0.5 block text-body leading-relaxed text-slate-400"
											>{source.value}</span
										>
									</span>
								</div>
							{/each}
						</div>
						<div class="mt-2.5 text-label leading-relaxed text-slate-500">
							{t('convo.contradictionExplainer')}
						</div>
					</div>
				{/if}
			{/if}
		</div>
		<div class="mt-1 ml-1 font-mono text-[9.5px] text-slate-500">{message.time}</div>
	</div>
{/if}
