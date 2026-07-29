<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import AppFrame from '$lib/components/chat/AppFrame.svelte';
	import AppHeader from '$lib/components/chat/AppHeader.svelte';
	import InfoBand from '$lib/components/chat/InfoBand.svelte';
	import Avatar from '$lib/components/chat/Avatar.svelte';
	import ChipRow from '$lib/components/chat/ChipRow.svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { profile } from '$lib/state/profile.svelte.js';
	import { INSTALLED_STORIES, LAST_INSTALLED_NOTE } from '$lib/story/library.js';

	const statusKey = {
		running: 'library.status.running',
		solved: 'library.status.solved',
		notStarted: 'library.status.notStarted'
	} as const;

	// Only "Lucys Portmonnaie" has a playable thread right now — every catalog
	// entry opens the same story overview until the other reference stories ship.
	function openStory(): void {
		void goto(resolve('/story'));
	}

	function noop(): void {
		// Decorative for now — no import/update backend exists yet (docs/concept.md §4).
	}

	const chips = [
		{ id: 'updates', label: t('library.chipCheckUpdates'), onClick: noop },
		{ id: 'storage', label: t('library.chipManageStorage'), onClick: noop },
		{ id: 'settings', label: t('library.chipSettings'), onClick: () => goto(resolve('/settings')) }
	];
</script>

<svelte:head><title>{t('library.title')} · Riddlon</title></svelte:head>

<AppFrame>
	<AppHeader onBack={() => goto(resolve('/chats'))} backOnDesktop={false}>
		{#snippet leading()}
			<Avatar kind="system" size={36} />
		{/snippet}
		<span class="block text-h1 font-medium text-slate-100">{t('library.title')}</span>
		<span class="mt-0.5 block truncate font-mono text-label text-slate-500"
			>{t('library.subtitle')}</span
		>
	</AppHeader>

	<InfoBand>
		<span class="font-mono text-[9px] tracking-[0.11em] text-slate-600"
			>{t('library.offlineNote')}</span
		>
	</InfoBand>

	<div class="min-h-0 flex-1 overflow-y-auto">
		<div class="mx-auto flex w-full max-w-pane flex-col gap-1 px-4.5 pt-4.5 pb-2.5 lg:px-6">
			<div
				class="mb-2 self-center rounded-control bg-slate-100/6 px-3 py-1.5 text-center font-mono text-[10.5px] text-slate-400"
			>
				{t('library.systemContactNote')}
			</div>

			<div class="mt-1.5 max-w-[82%] self-start">
				<div
					class="rounded-tr-2xl rounded-br-2xl rounded-bl-md border border-line bg-surface-raised px-3.5 pt-2.5 pb-2.5"
				>
					<div class="text-body leading-relaxed text-slate-100">
						{t('library.welcome', { name: profile.nickname, count: INSTALLED_STORIES.length })}
					</div>
				</div>
			</div>

			<div class="mt-3 flex w-full flex-col gap-2.5 self-start">
				<div class="ml-0.5 font-mono text-[9.5px] tracking-[0.1em] text-slate-500">
					{t('library.installedLabel')}
				</div>
				{#each INSTALLED_STORIES as story (story.id)}
					<button
						type="button"
						onclick={openStory}
						class="w-full rounded-tile border {story.status === 'running'
							? 'border-accent/40'
							: 'border-line'} bg-surface-raised p-3 text-left"
						style={story.status === 'running' ? 'border-radius:14px 14px 14px 4px' : ''}
					>
						<span class="flex items-center gap-3">
							<Avatar kind="cover" size={52} shape="tile" />
							<span class="min-w-0 flex-1">
								<span class="flex items-baseline gap-2">
									<span
										class="text-h2 font-medium {story.status === 'running'
											? 'text-slate-100'
											: 'text-slate-200'}">{story.title}</span
									>
									{#if story.status !== 'notStarted'}
										<span
											class="font-mono text-[9.5px] {story.status === 'running'
												? 'text-accent'
												: 'text-slate-500'}">{t(statusKey[story.status])}</span
										>
									{/if}
								</span>
								<span class="mt-1 block text-label text-slate-400">
									{story.genre} ·
									{#if story.chapter}
										Kapitel {story.chapter.current} von {story.chapter.total}
									{:else if story.achievements}
										{story.achievements.earned} von {story.achievements.total} Auszeichnungen
									{:else}
										{t(statusKey.notStarted)}
									{/if}
									· {story.contactCount} Kontakte
								</span>
								{#if story.progressPercent}
									<span class="mt-2 block h-[3px] overflow-hidden rounded-full bg-slate-100/13">
										<span class="block h-full bg-accent" style="width:{story.progressPercent}%"
										></span>
									</span>
								{/if}
							</span>
							<span class="text-body text-slate-500">›</span>
						</span>
					</button>
				{/each}
			</div>

			<div class="mt-4 max-w-[82%] self-start">
				<div
					class="rounded-tr-2xl rounded-br-2xl rounded-bl-md border border-line bg-surface-raised px-3.5 pt-2.5 pb-2.5"
				>
					<div class="text-body leading-relaxed text-slate-100">{t('library.askImport')}</div>
				</div>
			</div>

			<div
				class="mt-2.5 w-full self-start rounded-tile border border-dashed border-line-strong bg-slate-100/4 p-3.5"
			>
				<div class="font-mono text-[9.5px] tracking-[0.1em] text-slate-500">
					{t('library.importLabel')}
				</div>
				<div class="mt-2.5 flex gap-2.5">
					<button
						type="button"
						class="flex-1 rounded-control border border-accent/50 bg-accent/15 px-3 py-3 text-label font-medium text-slate-100 hover:bg-accent/25"
					>
						{t('library.importZip')}
					</button>
					<button
						type="button"
						class="flex-1 rounded-control border border-line-strong px-3 py-3 text-label font-medium text-slate-200 hover:bg-slate-100/8"
					>
						{t('library.importUrl')}
					</button>
				</div>
				<div class="mt-2.5 text-label leading-relaxed text-slate-500">
					{t('library.importNote')}
				</div>
			</div>

			<div
				class="mt-4 mb-1 self-center rounded-control bg-slate-100/6 px-3 py-1.5 text-center font-mono text-[10.5px] text-slate-400"
			>
				{t('library.lastInstalledNote', {
					title: LAST_INSTALLED_NOTE.title,
					size: LAST_INSTALLED_NOTE.size
				})}
			</div>
			<div class="h-1.5 flex-none"></div>
		</div>
	</div>

	<div
		class="flex-none border-t border-line bg-surface px-3.5 pt-[11px] pb-[22px] lg:px-6 lg:pb-3.5"
	>
		<div class="mx-auto w-full max-w-pane">
			<ChipRow {chips} />
		</div>
	</div>
</AppFrame>
