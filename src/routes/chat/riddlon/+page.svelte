<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import AppFrame from '$lib/components/chat/AppFrame.svelte';
	import AppHeader from '$lib/components/chat/AppHeader.svelte';
	import InfoBand from '$lib/components/chat/InfoBand.svelte';
	import Avatar from '$lib/components/chat/Avatar.svelte';
	import ChipRow from '$lib/components/chat/ChipRow.svelte';
	import { t } from '$lib/i18n/i18n.svelte.js';
	import { formatSizeLabel } from '$lib/llm/catalog.js';
	import { profile } from '$lib/state/profile.svelte.js';
	import { storyRuntime } from '$lib/state/engine.svelte.js';
	import { importPackageFromZipFile, importPackageFromUrl } from '$lib/content/index.js';
	import { installDemoStory } from '$lib/story/bootstrap.js';
	import { PACKAGE_ID as REFERENCE_PACKAGE_ID } from '$lib/story/reference-package.js';
	import { type CatalogEntry } from '$lib/story/library.js';
	import { ACHIEVEMENT_DEFS } from '$lib/story/reference-progress.js';

	const statusKey = {
		running: 'library.status.running',
		solved: 'library.status.solved',
		notStarted: 'library.status.notStarted'
	} as const;

	let notices = $state<{ id: string; text: string; failed: boolean }[]>([]);
	let importing = $state(false);
	let urlFieldOpen = $state(false);
	let urlDraft = $state('');
	let fileInput: HTMLInputElement | undefined = $state();

	// One source for "what's installed" (shared with the chat overview's library preview) —
	// this screen only asks it to re-read the registry after an import.
	const installed = $derived(storyRuntime.installedPackages);

	$effect(() => {
		void storyRuntime.init();
	});

	function noteId(): string {
		return `notice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
	}

	async function afterImport(
		result: Awaited<ReturnType<typeof importPackageFromZipFile>>
	): Promise<void> {
		if (result.ok) {
			notices = [
				...notices,
				{
					id: noteId(),
					failed: false,
					text: t('library.lastInstalledNote', {
						title: result.summary.title,
						size: formatSizeLabel(result.summary.sizeBytes)
					})
				}
			];
			await storyRuntime.refreshLibrary();
		} else {
			const message = result.errors.map((e) => e.message).join(' · ');
			notices = [
				...notices,
				{ id: noteId(), failed: true, text: t('library.importErrorNote', { message }) }
			];
		}
	}

	async function pickZip(): Promise<void> {
		fileInput?.click();
	}

	async function onZipChosen(event: Event): Promise<void> {
		// `currentTarget` is only valid for the synchronous dispatch of the event — it's
		// already `null` by the time an `await` below resumes, so it's captured up front.
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		importing = true;
		try {
			await afterImport(await importPackageFromZipFile(file));
		} finally {
			importing = false;
			input.value = '';
		}
	}

	function openUrlField(): void {
		urlFieldOpen = true;
	}

	async function submitUrlImport(): Promise<void> {
		const url = urlDraft.trim();
		if (!url) return;
		importing = true;
		try {
			await afterImport(await importPackageFromUrl(url));
			urlDraft = '';
			urlFieldOpen = false;
		} finally {
			importing = false;
		}
	}

	// Every installed package gets its own live engine/save session (#37) — switching activates
	// (and, on first visit, loads) that package's session before `/story` reads it, so opening a
	// second story never shows or overwrites the reference story's progress.
	function openStory(packageId: string): void {
		void (async () => {
			await storyRuntime.switchTo(packageId);
			await goto(resolve('/story'));
		})();
	}

	function noop(): void {
		// Genuinely not built yet (update-checking, storage management) — tracked explicitly
		// rather than faking success (see #16's acceptance criteria).
	}

	/** Re-installs the bundled demo after a factory reset. A full page load follows, because the
	 *  engine runtime already resolved its (story-less) init — same reasoning as `state/reset.ts`. */
	async function addDemoStory(): Promise<void> {
		importing = true;
		try {
			await installDemoStory();
			location.href = resolve('/');
		} finally {
			importing = false;
		}
	}

	const displayEntries = $derived.by((): CatalogEntry[] => {
		return installed.map((pkg) => {
			const isReference = pkg.id === REFERENCE_PACKAGE_ID;
			const progress = isReference ? storyRuntime.progress : null;
			const solved = isReference && storyRuntime.solved;
			const totalScenes = progress?.totalSceneCount ?? 0;
			const doneScenes = progress?.completedSceneCount ?? 0;
			return {
				id: pkg.id,
				title: pkg.title,
				genre: 'Krimi',
				status: solved ? 'solved' : 'running',
				contactCount: pkg.characterIds.length,
				...(solved
					? {
							achievements: {
								earned: storyRuntime.earnedAchievements.length,
								total: ACHIEVEMENT_DEFS.length
							}
						}
					: { chapter: { current: doneScenes + 1, total: Math.max(totalScenes, 1) } }),
				progressPercent: totalScenes > 0 ? Math.round((doneScenes / totalScenes) * 100) : undefined
			};
		});
	});

	// A real registry means 0 or 1 installed stories most of the time, where the mock catalog always
	// had three — so the plural-only greeting needs singular/empty variants (cf. `convo.*Plural`).
	const welcome = $derived.by(() => {
		const count = displayEntries.length;
		if (count === 0) return t('library.welcomeEmpty', { name: profile.nickname });
		if (count === 1) return t('library.welcomeSingle', { name: profile.nickname });
		return t('library.welcome', { name: profile.nickname, count });
	});

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
					<div class="text-body leading-relaxed text-slate-100">{welcome}</div>
				</div>
			</div>

			<div class="mt-3 flex w-full flex-col gap-2.5 self-start">
				<div class="ml-0.5 font-mono text-[9.5px] tracking-[0.1em] text-slate-500">
					{displayEntries.length === 0 ? t('library.emptyLabel') : t('library.installedLabel')}
				</div>
				{#if displayEntries.length === 0}
					<div class="rounded-tile border border-dashed border-line-strong bg-slate-100/3 p-3.5">
						<p class="text-label leading-relaxed text-slate-400">
							{t('library.installDemoNote')}
						</p>
						<button
							type="button"
							disabled={importing}
							onclick={() => void addDemoStory()}
							class="mt-2.5 w-full rounded-control border border-line-strong px-3 py-2.5 text-label font-medium text-slate-200 hover:bg-slate-100/8 disabled:opacity-50"
						>
							{t('library.installDemo')}
						</button>
					</div>
				{/if}
				{#each displayEntries as story (story.id)}
					<button
						type="button"
						onclick={() => openStory(story.id)}
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
				<input
					bind:this={fileInput}
					type="file"
					accept=".zip"
					class="hidden"
					onchange={onZipChosen}
				/>
				<div class="mt-2.5 flex gap-2.5">
					<button
						type="button"
						disabled={importing}
						onclick={pickZip}
						class="flex-1 rounded-control border border-accent/50 bg-accent/15 px-3 py-3 text-label font-medium text-slate-100 hover:bg-accent/25 disabled:opacity-50"
					>
						{importing ? t('library.importing') : t('library.importZip')}
					</button>
					<button
						type="button"
						disabled={importing}
						onclick={openUrlField}
						class="flex-1 rounded-control border border-line-strong px-3 py-3 text-label font-medium text-slate-200 hover:bg-slate-100/8 disabled:opacity-50"
					>
						{t('library.importUrl')}
					</button>
				</div>
				{#if urlFieldOpen}
					<div class="mt-2.5 flex gap-2">
						<input
							bind:value={urlDraft}
							onkeydown={(event) => event.key === 'Enter' && submitUrlImport()}
							placeholder={t('library.importUrlPlaceholder')}
							class="min-w-0 flex-1 rounded-control border border-line-strong bg-slate-100/5 px-3 py-2 text-label text-slate-100 placeholder:text-slate-500 focus:border-accent/60 focus:outline-none"
						/>
						<button
							type="button"
							disabled={importing}
							onclick={submitUrlImport}
							class="flex-none rounded-control border border-accent/50 bg-accent/15 px-3 py-2 text-label font-medium text-slate-100 disabled:opacity-50"
						>
							{t('library.importUrlApply')}
						</button>
					</div>
				{/if}
				<div class="mt-2.5 text-label leading-relaxed text-slate-500">
					{t('library.importNote')}
				</div>
			</div>

			{#each notices as notice (notice.id)}
				<div
					class="mt-2.5 mb-1 self-center rounded-control px-3 py-1.5 text-center font-mono text-[10.5px] {notice.failed
						? 'bg-danger/15 text-danger'
						: 'bg-slate-100/6 text-slate-400'}"
				>
					{notice.text}
				</div>
			{/each}
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
