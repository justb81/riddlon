/**
 * Stream plumbing between `promptStreaming()` and the chat UI.
 *
 * Two things need normalising. Chrome has shipped `promptStreaming` in both shapes over its
 * lifetime — chunks as deltas, and chunks as cumulative snapshots of the whole answer so far — and
 * the WebLLM backend yields deltas. The UI only ever wants deltas, so `toDeltas` detects and
 * flattens the cumulative shape. And `ReadableStream` is only async-iterable in newer browsers, so
 * we read it explicitly rather than depend on that.
 */

/** Reads a `ReadableStream` as an async iterable, releasing the reader on early exit. */
export async function* readableToAsyncIterable<T>(stream: ReadableStream<T>): AsyncIterable<T> {
	const reader = stream.getReader();
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) return;
			if (value !== undefined) yield value;
		}
	} finally {
		// Cancel rather than just release: on an early `break` the producer should stop generating.
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}

/**
 * Normalises a chunk stream to deltas.
 *
 * A chunk that starts with everything emitted so far is treated as a cumulative snapshot and only
 * its new tail is yielded; anything else passes through untouched. Empty chunks are dropped.
 */
export async function* toDeltas(chunks: AsyncIterable<string>): AsyncIterable<string> {
	let accumulated = '';
	for await (const chunk of chunks) {
		if (!chunk) continue;

		if (accumulated && chunk.length > accumulated.length && chunk.startsWith(accumulated)) {
			const delta = chunk.slice(accumulated.length);
			accumulated = chunk;
			if (delta) yield delta;
			continue;
		}

		// First chunk, or a genuine delta. A first chunk is ambiguous by nature (a cumulative
		// stream's first snapshot *is* its first delta), so either reading yields the same text.
		accumulated += chunk;
		yield chunk;
	}
}

/**
 * Throws if the signal is already aborted, so callers fail before doing expensive work.
 * Returns the reason as-is when it's an `Error`, matching what `AbortController.abort(reason)` does.
 */
export function throwIfAborted(signal: AbortSignal | undefined): void {
	if (!signal?.aborted) return;
	const reason = signal.reason;
	throw reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError');
}
