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
	 * The probe at the bottom is what makes "does the model answer with JSON at all?" a ten-second
	 * question: it runs *only* the director pass, against an editable transcript and a scene you
	 * pick, as often as you like — no chat turns, no waiting for a character reply, and the exact
	 * prompt visible next to the raw answer. Isolating the two layers is the whole point: the
	 * story's flag chain and the engine's unlocks are already covered in Node (`engine.spec.ts`'s
	 * §7 walkthrough sets `flag:lucy-identified` / `flag:witnesses-named` by hand and asserts the
	 * contacts appear), so anything that still doesn't advance is between the model and the parser.
	 *
	 * Not linked from anywhere in the app. Delete it once the director pass has real coverage
	 * (see the follow-up issue on director quality).
	 */

	import { llm } from '$lib/llm/llm.svelte.js';
	import {
		buildDirectorPrompt,
		claimableClueIds,
		parseDirectorVerdict,
		settableFlags,
		type DirectorVerdict
	} from '$lib/llm/director.js';
	import { storyRuntime } from '$lib/state/engine.svelte.js';
	import { storySession } from '$lib/state/story-session.svelte.js';
	import { SPEAKER_ME } from '$lib/story/types.js';

	let flagDraft = $state('flag:');

	$effect(() => {
		void storyRuntime.init();
	});

	function setFlag(): void {
		const flag = flagDraft.trim();
		if (flag) storyRuntime.setFlag(flag);
	}

	/* ---------------------------------------------------------------------- */
	/* Director probe                                                         */
	/* ---------------------------------------------------------------------- */

	let threadKey = $state('');
	let sceneId = $state('');
	let transcript = $state('');
	let probePrompt = $state('');
	let probeRaw = $state('');
	let probeVerdict = $state<DirectorVerdict | null>(null);
	let probeError = $state('');
	let probing = $state(false);

	const thread = $derived(storyRuntime.threadFor(threadKey));
	/** The graph node, not the display projection — only it carries exitConditions/revealables. */
	const node = $derived(storyRuntime.bundle?.graph.nodes.find((n) => n.id === sceneId));
	const directorScene = $derived(
		node
			? { goals: node.goals, exitConditions: node.exitConditions, revealables: node.revealables }
			: { goals: [], exitConditions: [], revealables: [] }
	);
	/** Whoever the picked scene is with — the only characters a claim may be attributed to. */
	const sceneCast = $derived(
		storyRuntime.cast.filter((c) => node?.participants.includes(c.id) ?? false)
	);

	/** Defaults to the first thread; `loadThread()` then takes the scene the app itself calls active. */
	$effect(() => {
		if (!threadKey && storyRuntime.threads.length > 0) threadKey = storyRuntime.threads[0].key;
	});

	function loadThread(): void {
		if (!thread) return;
		sceneId = thread.activeSceneId ?? thread.sceneIds.at(-1) ?? '';
		transcript = storySession
			.messagesFor(thread.key)
			.slice(-6)
			.map(
				(m) => `${m.from === SPEAKER_ME ? 'Du' : storyRuntime.displayNameFor(m.from)}: ${m.text}`
			)
			.join('\n');
	}

	/** `Name: text` per line — the same shape `buildDirectorPrompt` renders the transcript in. */
	function parseTranscript(raw: string): { who: string; text: string }[] {
		return raw
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const at = line.indexOf(':');
				return at === -1
					? { who: 'Du', text: line }
					: { who: line.slice(0, at).trim(), text: line.slice(at + 1).trim() };
			});
	}

	function buildPrompt(): string {
		probePrompt = buildDirectorPrompt({
			scene: directorScene,
			clues: (storyRuntime.bundle?.clues ?? []).map((clue) => ({ id: clue.id, label: clue.label })),
			characters: sceneCast.map((c) => ({ id: c.id, name: c.displayName })),
			turns: parseTranscript(transcript)
		});
		return probePrompt;
	}

	async function runDirector(): Promise<void> {
		probeError = '';
		probeRaw = '';
		probeVerdict = null;
		if (!node) {
			probeError = 'pick a scene first';
			return;
		}
		if (!llm.ready) {
			probeError = `no model loaded (llm.status = ${llm.status}) — boot via / first`;
			return;
		}

		const prompt = buildPrompt();
		probing = true;
		try {
			// A separate key from the app's own 'director', so probing never disturbs a live pass —
			// each key gets its own backend handle (see adapter.ts). Probe right after a page reload
			// to see the director answer with a clean context, then again after a few chat turns to
			// see what accumulated history does to it.
			const session = await llm.session('director-probe', {
				systemPrompt: 'Du antwortest ausschließlich mit JSON.',
				maxHistoryTurns: 0
			});
			probeRaw = await session.prompt(prompt);
			await session.destroy();
			probeVerdict = parseDirectorVerdict(probeRaw, {
				flags: settableFlags(directorScene),
				clueIds: claimableClueIds(directorScene),
				characters: sceneCast.map((c) => ({ id: c.id, name: c.displayName }))
			});
		} catch (error) {
			probeError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
		} finally {
			probing = false;
		}
	}

	/** Applies exactly what the app would have applied, so the graph moves for real. */
	function applyVerdict(): void {
		const verdict = probeVerdict;
		if (!verdict) return;
		for (const claim of verdict.clues) {
			storyRuntime.recordClueClaim(claim.id, claim.characterId, claim.value);
		}
		for (const flag of verdict.flags) storyRuntime.setFlag(flag);
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
			<dt class="text-slate-500">outcomes</dt>
			<dd>{storyRuntime.outcomes.map((o) => o.id).join(', ') || '—'}</dd>
			<dt class="text-slate-500">llm</dt>
			<dd>
				{llm.status} · {llm.backend ?? 'no backend'} · {llm.activeModelId ?? 'no model'}
			</dd>
		</dl>
	</section>

	<section class="rounded-panel border border-line bg-surface-raised p-4">
		<h2 class="text-h2">Threads</h2>
		<p class="mt-1 text-label text-slate-400">
			`activeSceneId` is the scene whose goals drive the persona and whose exitConditions the
			director may set — if it lags behind what the character is already talking about, the last
			verdict didn't land.
		</p>
		<ul class="mt-2 flex flex-col gap-1 font-mono text-[11px]">
			{#each storyRuntime.threads as t (t.key)}
				{@const active = storyRuntime.sceneById(t.activeSceneId ?? '')}
				<li>
					{t.kind} · {t.participantIds.map((id) => storyRuntime.displayNameFor(id)).join(', ')} · scenes
					{t.sceneIds.length} · active:
					<span class={active ? 'text-accent' : 'text-slate-500'}
						>{active ? `#${active.index} ${active.goals.join(', ')}` : 'none'}</span
					>
				</li>
			{:else}
				<li class="text-slate-500">— no threads</li>
			{/each}
		</ul>
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

	<section class="rounded-panel border border-line bg-surface-raised p-4">
		<h2 class="text-h2">Director probe</h2>
		<p class="mt-1 text-label text-slate-400">
			Runs only the director pass — no chat turn, no character reply. Load a thread's last six
			messages, edit them freely, and see the exact prompt next to the raw answer and the verdict
			that survived the allowlist. An empty verdict on a transcript that clearly satisfies the scene
			means the model, not the story.
		</p>

		<div class="mt-3 flex flex-wrap items-end gap-2">
			<label class="flex flex-col gap-1 text-label text-slate-400">
				thread
				<select
					bind:value={threadKey}
					class="rounded-control border border-line-strong bg-slate-100/5 px-2 py-1.5 font-mono text-[11px]"
				>
					{#each storyRuntime.threads as t (t.key)}
						<option value={t.key}
							>{t.kind}: {t.participantIds
								.map((id) => storyRuntime.displayNameFor(id))
								.join(', ')}</option
						>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1 text-label text-slate-400">
				scene
				<select
					bind:value={sceneId}
					class="rounded-control border border-line-strong bg-slate-100/5 px-2 py-1.5 font-mono text-[11px]"
				>
					<option value="">—</option>
					{#each storyRuntime.scenes as scene (scene.id)}
						<option value={scene.id}
							>#{scene.index}
							{scene.done ? 'done' : scene.unlocked ? 'open' : 'locked'} · {scene.goals.join(
								', '
							) || '—'}</option
						>
					{/each}
				</select>
			</label>
			<button
				type="button"
				onclick={loadThread}
				class="rounded-control border border-line-strong px-3 py-2 text-label">Load thread</button
			>
		</div>

		<dl class="mt-3 grid grid-cols-[10rem_1fr] gap-1 font-mono text-[11px]">
			<dt class="text-slate-500">scene node</dt>
			<dd>{node ? node.id : `not found (sceneId=${sceneId || '—'})`}</dd>
			<dt class="text-slate-500">settable flags</dt>
			<dd>{settableFlags(directorScene).join(', ') || '(keine)'}</dd>
			<dt class="text-slate-500">claimable clues</dt>
			<dd>{claimableClueIds(directorScene).join(', ') || '(keine)'}</dd>
			<dt class="text-slate-500">scene cast</dt>
			<dd>{sceneCast.map((c) => c.displayName).join(', ') || '—'}</dd>
		</dl>

		<textarea
			bind:value={transcript}
			rows="7"
			placeholder="Lucy: Max und Sabine haben mir deine Nummer gegeben.&#10;Du: ok, kann ich gern machen. die beiden kenne ich"
			class="mt-3 w-full rounded-control border border-line-strong bg-slate-100/5 px-3 py-2 font-mono text-[11px]"
		></textarea>

		<div class="mt-2 flex flex-wrap gap-2">
			<button
				type="button"
				onclick={buildPrompt}
				class="rounded-control border border-line-strong px-3 py-2 text-label">Build prompt</button
			>
			<button
				type="button"
				onclick={runDirector}
				disabled={probing}
				class="rounded-control border border-accent/50 bg-accent/15 px-3 py-2 text-label disabled:opacity-50"
				>{probing ? 'Running…' : 'Run director'}</button
			>
			<button
				type="button"
				onclick={applyVerdict}
				disabled={!probeVerdict}
				class="rounded-control border border-line-strong px-3 py-2 text-label disabled:opacity-50"
				>Apply verdict</button
			>
		</div>

		{#if probeError}
			<p class="mt-2 font-mono text-[10.5px] text-danger">{probeError}</p>
		{/if}
		{#if probePrompt}
			<pre
				class="mt-3 max-h-72 overflow-auto rounded-control border border-line bg-slate-100/5 p-2 font-mono text-[10.5px] whitespace-pre-wrap text-slate-400">{probePrompt}</pre>
		{/if}
		{#if probeRaw}
			<h3 class="mt-3 text-label text-slate-400">raw answer</h3>
			<pre
				class="mt-1 overflow-x-auto font-mono text-[10.5px] whitespace-pre-wrap text-slate-200">{probeRaw}</pre>
		{/if}
		{#if probeVerdict}
			<h3 class="mt-3 text-label text-slate-400">parsed verdict</h3>
			<pre class="mt-1 overflow-x-auto font-mono text-[10.5px] text-accent">{JSON.stringify(
					probeVerdict,
					null,
					1
				)}</pre>
		{/if}
	</section>
</div>
