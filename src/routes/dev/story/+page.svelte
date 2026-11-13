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
	 * §1.3 walkthrough sets `flag:lucy-identified` / `flag:witnesses-named` by hand and asserts the
	 * contacts appear), so anything that still doesn't advance is between the model and the parser.
	 *
	 * "Director cases" below turns the probe into a measurement (#54): it runs a story's
	 * `director-cases.json` — fixed transcripts with known answers — several times each against the
	 * loaded model and tallies the verdicts. The protocol is in `stories/README.md`.
	 *
	 * Not linked from anywhere in the app.
	 */

	import { llm } from '$lib/llm/llm.svelte.js';
	import {
		buildDirectorPrompt,
		buildDirectorQuestions,
		buildDirectorSchema,
		DIRECTOR_SESSION_CONFIG,
		DIRECTOR_WINDOW,
		lastExchangeOf,
		isReadableDirectorAnswer,
		parseDirectorVerdict,
		type DirectorQuestions,
		type DirectorVerdict
	} from '$lib/llm/director.js';
	import {
		caseQuestions,
		caseTurns,
		checkCase,
		ratio,
		scoreCase,
		tally,
		type CaseRun,
		type CaseScore,
		type DirectorCaseFile
	} from './director-cases.js';
	import { storyRuntime } from '$lib/state/engine.svelte.js';
	import { getEndpointConfig } from '$lib/llm/endpoint-config.js';
	import { profile } from '$lib/state/profile.svelte.js';
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
	let probeMs = $state<number | null>(null);

	const thread = $derived(storyRuntime.threadFor(threadKey));
	/** The graph node, not the display projection — only it carries exitConditions/revealables. */
	const node = $derived(storyRuntime.bundle?.graph.nodes.find((n) => n.id === sceneId));
	/** Whoever the picked scene is with — the only characters a claim may be attributed to. */
	const sceneCast = $derived(
		storyRuntime.cast.filter((c) => node?.participants.includes(c.id) ?? false)
	);
	/** Named as the transcript names them, exactly as `story-session` does for a live pass. */
	const sceneCharacters = $derived(
		sceneCast.map((c) => ({ id: c.id, name: storyRuntime.displayNameFor(c.id) }))
	);
	/** What a live pass would ask right now: open goals, events, endings and clues. */
	const questions = $derived<DirectorQuestions>(
		node
			? buildDirectorQuestions(
					{ ...node, outcomes: node.type === 'group-chat-scene' ? node.outcomes : [] },
					{
						reachedGoals: new Set(storySession.reachedGoals[node.id] ?? []),
						isFlagSet: (ref) => storyRuntime.isConditionMet(ref),
						isClueOpen: (clueId) => {
							const claimedBy = new Set(
								(storyRuntime.clueDisplays[clueId]?.sources ?? []).map((s) => s.characterId)
							);
							return sceneCast.some((c) => !claimedBy.has(c.id));
						}
					}
				)
			: { goals: [], events: [], outcomes: [], clueIds: [] }
	);
	const clueLabels = $derived(
		(storyRuntime.bundle?.clues ?? []).map((clue) => ({ id: clue.id, label: clue.label }))
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
		const turns = parseTranscript(transcript);
		probePrompt = buildDirectorPrompt({
			questions,
			clues: clueLabels,
			characters: sceneCharacters,
			turns,
			// The same cut the live pass makes — without it, events would be judged on the whole
			// window again, which is exactly what #135 stopped.
			lastExchange: lastExchangeOf(turns, (t) => t.who === 'Du'),
			goalDetails: node?.goalDetails,
			flagDetails: node?.flagDetails
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
			const session = await llm.session('director-probe', DIRECTOR_SESSION_CONFIG);
			const started = performance.now();
			probeRaw = await session.prompt(prompt, {
				responseSchema: buildDirectorSchema({ questions, characters: sceneCharacters })
			});
			probeMs = Math.round(performance.now() - started);
			await session.destroy();
			probeVerdict = parseDirectorVerdict(probeRaw, {
				questions,
				characters: sceneCharacters,
				clues: clueLabels,
				turns: parseTranscript(transcript)
			});
		} catch (error) {
			probeError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
		} finally {
			probing = false;
		}
	}

	/** Applies exactly what the app would have applied — goals remembered, exit flag derived. */
	function applyVerdict(): void {
		if (probeVerdict && node) void storySession.applyDirectorVerdict(node.id, probeVerdict);
	}

	/* ---------------------------------------------------------------------- */
	/* Director cases                                                         */
	/* ---------------------------------------------------------------------- */

	/**
	 * Loaded lazily and only in dev: the case files quote story dialogue, and a production build
	 * must not carry story content outside the packages themselves.
	 */
	const caseLoaders: Record<string, () => Promise<DirectorCaseFile>> = import.meta.env.DEV
		? import.meta.glob<DirectorCaseFile>('/stories/*/director-cases.json', { import: 'default' })
		: {};
	const caseFileKeys = Object.keys(caseLoaders);

	let caseFileKey = $state(caseFileKeys[0] ?? '');
	let caseFile = $state<DirectorCaseFile | null>(null);
	let caseRunsEach = $state(3);
	let caseWindow = $state(DIRECTOR_WINDOW);
	/** Off measures the bare slugs, as a package without `goalDetails`/`flagDetails` would be asked. */
	let caseCriteria = $state(true);
	let caseResults = $state<{ run: CaseRun; score: CaseScore | null }[]>([]);
	let caseProgress = $state('');
	let caseRunning = $state(false);
	let caseStop = false;

	$effect(() => {
		const key = caseFileKey;
		if (!key) return;
		void caseLoaders[key]().then((file) => {
			caseFile = file;
			caseRunsEach = file.runs;
		});
	});

	const graphNodes = $derived(storyRuntime.bundle?.graph.nodes ?? []);
	const caseNode = (sceneId: string) => {
		const n = graphNodes.find((x) => x.id === sceneId);
		return n && { ...n, outcomes: n.type === 'group-chat-scene' ? n.outcomes : [] };
	};
	const caseProblems = $derived.by(() => {
		if (!caseFile) return [];
		if (!storyRuntime.bundle)
			return ['no story package active — install and start one via / first'];
		return caseFile.cases.flatMap((c) => {
			const n = caseNode(c.scene);
			return checkCase(c, n, n?.participants ?? []);
		});
	});

	/**
	 * Which model actually answered. `activeModelId` is the local catalog's id, which an endpoint
	 * or Chrome's built-in model only borrows — two endpoint models would otherwise look like one.
	 */
	function modelLabel(): string {
		if (llm.backend === 'openai') return `openai:${getEndpointConfig()?.model ?? '?'}`;
		if (llm.backend === 'native') return 'native:chrome-built-in';
		return `${llm.backend ?? '?'}:${llm.activeModelId ?? '?'}`;
	}

	async function runCases(): Promise<void> {
		if (!caseFile || caseRunning) return;
		if (!llm.ready) {
			caseProgress = `no model loaded (llm.status = ${llm.status}) — boot via / first`;
			return;
		}
		caseRunning = true;
		caseStop = false;
		caseResults = [];
		const model = modelLabel();
		const total = caseFile.cases.length * caseRunsEach;
		try {
			// Case-major, runs inner: a stopped measurement still covers whole cases.
			for (const testCase of caseFile.cases) {
				const n = caseNode(testCase.scene);
				if (!n) continue;
				const questions = caseQuestions(n, testCase);
				const characters = storyRuntime.cast
					.filter((c) => n.participants.includes(c.id))
					.map((c) => ({ id: c.id, name: testCase.names?.[c.id] ?? c.displayName }));
				const { turns, lastExchange } = caseTurns(testCase, caseWindow, profile.nickname);
				const prompt = buildDirectorPrompt({
					questions,
					clues: clueLabels,
					characters,
					turns,
					lastExchange,
					goalDetails: caseCriteria ? n.goalDetails : undefined,
					flagDetails: caseCriteria ? n.flagDetails : undefined
				});
				const allowlist = { questions, characters, clues: clueLabels, turns };
				for (let i = 0; i < caseRunsEach; i++) {
					if (caseStop) return;
					caseProgress = `${caseResults.length + 1} / ${total} · ${testCase.id}`;
					const run: CaseRun = {
						caseId: testCase.id,
						model,
						window: caseWindow,
						criteria: caseCriteria,
						prompt,
						allowlist,
						raw: '',
						verdict: { goals: [], flags: [], clues: [] },
						ms: 0
					};
					try {
						const session = await llm.session('director-cases', DIRECTOR_SESSION_CONFIG);
						const started = performance.now();
						run.raw = await session.prompt(prompt, {
							responseSchema: buildDirectorSchema({ questions, characters })
						});
						run.ms = Math.round(performance.now() - started);
						await session.destroy();
						run.verdict = parseDirectorVerdict(run.raw, allowlist);
						run.unreadable = !isReadableDirectorAnswer(run.raw);
						caseResults.push({
							run,
							score: run.unreadable ? null : scoreCase(testCase, questions, run.verdict)
						});
					} catch (error) {
						run.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
						caseResults.push({ run, score: null });
					}
				}
			}
		} finally {
			caseRunning = false;
			caseProgress = `${caseResults.length} / ${total} done`;
		}
	}

	const caseTotal = $derived(tally(caseResults));
	const perCase = $derived(
		(caseFile?.cases ?? []).map((c) => ({
			id: c.id,
			t: tally(caseResults.filter((r) => r.run.caseId === c.id))
		}))
	);

	/** Every run with its raw answer — what `src/lib/llm/__fixtures__/director-answers/` keeps. */
	function downloadRuns(): void {
		const blob = new Blob(
			[
				JSON.stringify(
					{ recordedAt: new Date().toISOString(), runs: caseResults.map((r) => r.run) },
					null,
					'\t'
				)
			],
			{ type: 'application/json' }
		);
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `director-runs-${caseResults[0]?.run.model.replace(/[^\w.-]+/g, '_') ?? 'none'}-w${caseWindow}${caseCriteria ? '' : '-bare'}.json`;
		a.click();
		URL.revokeObjectURL(a.href);
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
			<dt class="text-slate-500">open goals</dt>
			<dd>{questions.goals.join(', ') || '(keine)'}</dd>
			<dt class="text-slate-500">reached goals</dt>
			<dd>{(node && storySession.reachedGoals[node.id]?.join(', ')) || '(keine)'}</dd>
			<dt class="text-slate-500">events</dt>
			<dd>{questions.events.join(', ') || '(keine)'}</dd>
			<dt class="text-slate-500">outcomes</dt>
			<dd>{questions.outcomes.map((o) => o.id).join(', ') || '(keine)'}</dd>
			<dt class="text-slate-500">claimable clues</dt>
			<dd>{questions.clueIds.join(', ') || '(keine)'}</dd>
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
			<h3 class="mt-3 text-label text-slate-400">raw answer · {probeMs ?? '—'} ms</h3>
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

	<section class="rounded-panel border border-line bg-surface-raised p-4">
		<h2 class="text-h2">Director cases</h2>
		<p class="mt-1 text-label text-slate-400">
			Runs a story's <code>director-cases.json</code> against the loaded model — every case
			{caseRunsEach}× — and tallies the verdicts against what the case expects. Independent of the
			save: each case starts with no flag set. Protocol in <code>stories/README.md</code>.
		</p>

		<div class="mt-3 flex flex-wrap items-end gap-2">
			<label class="flex flex-col gap-1 text-label text-slate-400">
				case file
				<select
					bind:value={caseFileKey}
					class="rounded-control border border-line-strong bg-slate-100/5 px-2 py-1.5 font-mono text-[11px]"
				>
					{#each caseFileKeys as key (key)}
						<option value={key}>{key}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1 text-label text-slate-400">
				runs each
				<input
					type="number"
					min="1"
					bind:value={caseRunsEach}
					class="w-16 rounded-control border border-line-strong bg-slate-100/5 px-2 py-1.5 font-mono text-[11px]"
				/>
			</label>
			<label class="flex flex-col gap-1 text-label text-slate-400">
				window
				<input
					type="number"
					min="1"
					bind:value={caseWindow}
					class="w-16 rounded-control border border-line-strong bg-slate-100/5 px-2 py-1.5 font-mono text-[11px]"
				/>
			</label>
			<label class="flex items-center gap-1.5 self-center text-label text-slate-400">
				<input type="checkbox" bind:checked={caseCriteria} />
				authored criteria
			</label>
			<button
				type="button"
				onclick={runCases}
				disabled={caseRunning || !caseFile || caseProblems.length > 0}
				class="rounded-control border border-accent/50 bg-accent/15 px-3 py-2 text-label disabled:opacity-50"
				>{caseRunning ? 'Running…' : 'Run cases'}</button
			>
			<button
				type="button"
				onclick={() => (caseStop = true)}
				disabled={!caseRunning}
				class="rounded-control border border-line-strong px-3 py-2 text-label disabled:opacity-50"
				>Stop</button
			>
			<button
				type="button"
				onclick={downloadRuns}
				disabled={caseRunning || caseResults.length === 0}
				class="rounded-control border border-line-strong px-3 py-2 text-label disabled:opacity-50"
				>Download runs</button
			>
		</div>

		<p class="mt-2 font-mono text-[11px] text-slate-400">
			model {modelLabel()} · {caseProgress || 'idle'}
		</p>
		{#each caseProblems as problem (problem)}
			<p class="font-mono text-[10.5px] text-danger">{problem}</p>
		{/each}

		{#if caseResults.length > 0}
			<table class="mt-3 w-full font-mono text-[10.5px]">
				<thead class="text-left text-slate-500">
					<tr>
						<th>case</th>
						<th>goals hit</th>
						<th>goals early</th>
						<th>events hit</th>
						<th>events false</th>
						<th>ending right</th>
						<th>clues</th>
						<th>err</th>
						<th>unreadable</th>
						<th>median ms</th>
					</tr>
				</thead>
				<tbody>
					{#each [...perCase.filter((p) => p.t.runs > 0), { id: 'total', t: caseTotal }] as row (row.id)}
						<tr class={row.id === 'total' ? 'border-t border-line text-accent' : ''}>
							<td>{row.id}</td>
							<td>{ratio(row.t.goals.hit, row.t.goals.hit + row.t.goals.miss)}</td>
							<td
								>{ratio(
									row.t.goals.falsePositive,
									row.t.goals.falsePositive + row.t.goals.correctNo
								)}</td
							>
							<td>{ratio(row.t.events.hit, row.t.events.hit + row.t.events.miss)}</td>
							<td
								>{ratio(
									row.t.events.falsePositive,
									row.t.events.falsePositive + row.t.events.correctNo
								)}</td
							>
							<td
								>{ratio(
									row.t.outcomes.right,
									row.t.outcomes.right +
										row.t.outcomes.missed +
										row.t.outcomes.false +
										row.t.outcomes.wrong
								)}</td
							>
							<td>{ratio(row.t.cluesFound, row.t.cluesExpected)} +{row.t.cluesExtra}</td>
							<td>{row.t.errors}</td>
							<td>{row.t.unreadable}</td>
							<td>{row.t.medianMs ?? '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>
</div>
