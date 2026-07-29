<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import AppHeader from '$lib/components/chat/AppHeader.svelte';
	import InfoBand from '$lib/components/chat/InfoBand.svelte';
	import Avatar from '$lib/components/chat/Avatar.svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { profile } from '$lib/state/profile.svelte.js';
	import {
		DISGUISE_MODES,
		MODEL_OPTIONS,
		PRONOUN_OPTIONS,
		addressPreview
	} from '$lib/state/profile.js';

	const preview = $derived(addressPreview(profile.addressAs, profile.nickname));
</script>

<svelte:head><title>{t('settings.title')} · Riddlon</title></svelte:head>

<div class="flex h-dvh flex-col bg-surface">
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

	<div class="flex flex-1 flex-col gap-7 overflow-y-auto px-5.5 pt-5.5 pb-8.5">
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
				{#each MODEL_OPTIONS as option (option.id)}
					<button
						type="button"
						onclick={() => (profile.model = option.id)}
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
							>{option.sizeLabel} · {option.loaded
								? t('settings.modelLoaded')
								: t('settings.modelNotLoaded')}</span
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
	</div>
</div>
