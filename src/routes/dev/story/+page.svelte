<script lang="ts">
	/**
	 * Dev-only harness for the story runtime and the director pass.
	 *
	 * Automated tests cannot run real inference (CI and the dev sandbox have no GPU), and a
	 * director verdict that quietly fails to set a flag is otherwise invisible: the story just
	 * stops advancing with no error anywhere. This route shows the active package's live engine
	 * state, lets a flag be set by hand so the scene graph can be walked without a model, and
	 * prints the last raw director answer next to what survived the allowlist.
	 *
	 * Not linked from anywhere in the app. Delete it once the director pass has real coverage
	 * (see the follow-up issue on director quality).
	 */

	import { storyRuntime } from '$lib/state/engine.svelte.js';
	import { storySession } from '$lib/state/story-session.svelte.js';

	let flagDraft = $state('flag:');

	$effect(() => {
		void storyRuntime.init();
	});

	function setFlag(): void {
		const flag = flagDraft.trim();
		if (flag) storyRuntime.setFlag(flag);
	}
</script>

<svelte:head><title>dev · story runtime</title></svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-5 p-6 text-slate-200">
	<h1 class="font-serif text-2xl">Story runtime</h1>

	<section class="rounded-panel border border-line bg-surface-raised p-4">
		<h2 class="text-h2">Active package</h2>
		<dl class="mt-2 grid grid-cols-[10rem_1fr] gap-1 font-mono text-[11px]">
			<dt class="text-slate-500">initialized</dt>
			<dd>{storyRuntime.initialized} / ready {storyRuntime.ready}</dd>
			<dt class="text-slate-500">packageId</dt>
			<dd>{storyRuntime.packageId ?? '—'}</dd>
			<dt class="text-slate-500">title</dt>
			<dd>{storyRuntime.title ?? '—'}</dd>
			<dt class="text-slate-500">saveId</dt>
			<dd>{storyRuntime.saveId ?? '—'}</dd>
			<dt class="text-slate-500">installed</dt>
			<dd>{storyRuntime.installedPackages.map((p) => p.title).join(', ') || '—'}</dd>
			<dt class="text-slate-500">scenes done</dt>
			<dd>
				{storyRuntime.progress?.completedSceneCount ?? 0} / {storyRuntime.progress
					?.totalSceneCount ?? 0}
			</dd>
			<dt class="text-slate-500">clues known</dt>
			<dd>
				{storyRuntime.progress?.knownClueCount ?? 0} / {storyRuntime.progress?.totalClueCount ?? 0}
				· {storyRuntime.progress?.openContradictionCount ?? 0} open
			</dd>
			<dt class="text-slate-500">visible cast</dt>
			<dd>
				{storyRuntime.visibleCharacterIds.map((id) => storyRuntime.displayNameFor(id)).join(', ') ||
					'—'}
			</dd>
			<dt class="text-slate-500">threads</dt>
			<dd>{storyRuntime.threads.map((t) => `${t.kind}:${t.key.slice(0, 8)}`).join(', ') || '—'}</dd>
			<dt class="text-slate-500">outcomes</dt>
			<dd>{storyRuntime.outcomes.map((o) => o.id).join(', ') || '—'}</dd>
		</dl>
	</section>

	<section class="rounded-panel border border-line bg-surface-raised p-4">
		<h2 class="text-h2">Scenes</h2>
		<ul class="mt-2 flex flex-col gap-1 font-mono text-[11px]">
			{#each storyRuntime.scenes as scene (scene.id)}
				<li
					class={scene.done ? 'text-accent' : scene.unlocked ? 'text-slate-200' : 'text-slate-500'}
				>
					{scene.index}. {scene.type} · {scene.done ? 'done' : scene.unlocked ? 'open' : 'locked'} · goals:
					{scene.goals.join(', ') || '—'}
				</li>
			{/each}
		</ul>
	</section>

	<section class="rounded-panel border border-line bg-surface-raised p-4">
		<h2 class="text-h2">Set a flag by hand</h2>
		<p class="mt-1 text-label text-slate-400">
			Walks the graph without a model — the same call the director pass makes.
		</p>
		<div class="mt-2 flex gap-2">
			<input
				bind:value={flagDraft}
				class="min-w-0 flex-1 rounded-control border border-line-strong bg-slate-100/5 px-3 py-2 font-mono text-[11px]"
			/>
			<button
				type="button"
				onclick={setFlag}
				class="rounded-control border border-accent/50 bg-accent/15 px-3 py-2 text-label"
				>Set</button
			>
		</div>
		<pre class="mt-2 overflow-x-auto font-mono text-[10.5px] text-slate-400">{JSON.stringify(
				storyRuntime.lastEffects,
				null,
				1
			)}</pre>
	</section>

	<section class="rounded-panel border border-line bg-surface-raised p-4">
		<h2 class="text-h2">Last director verdict</h2>
		<pre
			class="mt-2 overflow-x-auto font-mono text-[10.5px] whitespace-pre-wrap text-slate-400">{storySession.lastDirectorRaw ??
				'(nothing yet)'}</pre>
		<pre class="mt-2 overflow-x-auto font-mono text-[10.5px] text-accent">{JSON.stringify(
				storySession.lastDirectorVerdict,
				null,
				1
			)}</pre>
		{#if storySession.errorCode}
			<p class="mt-2 font-mono text-[10.5px] text-danger">error: {storySession.errorCode}</p>
		{/if}
	</section>
</div>
