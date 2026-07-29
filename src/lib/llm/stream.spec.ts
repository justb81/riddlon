import { describe, expect, it, vi } from 'vitest';
import { readableToAsyncIterable, throwIfAborted, toDeltas } from './stream.js';

function streamOf(...chunks: string[]): ReadableStream<string> {
	return new ReadableStream<string>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(chunk);
			controller.close();
		}
	});
}

async function collect(source: AsyncIterable<string>): Promise<string[]> {
	const out: string[] = [];
	for await (const value of source) out.push(value);
	return out;
}

describe('readableToAsyncIterable', () => {
	it('yields every chunk in order', async () => {
		expect(await collect(readableToAsyncIterable(streamOf('a', 'b', 'c')))).toEqual([
			'a',
			'b',
			'c'
		]);
	});

	it('cancels the stream when the consumer stops early', async () => {
		const cancel = vi.fn();
		const stream = new ReadableStream<string>({
			start(controller) {
				controller.enqueue('first');
				controller.enqueue('second');
			},
			cancel
		});

		for await (const value of readableToAsyncIterable(stream)) {
			expect(value).toBe('first');
			break;
		}

		expect(cancel).toHaveBeenCalledOnce();
	});
});

describe('toDeltas', () => {
	it('passes a delta stream through untouched', async () => {
		const source = readableToAsyncIterable(streamOf('Hallo', ' Lucy', '!'));
		expect(await collect(toDeltas(source))).toEqual(['Hallo', ' Lucy', '!']);
	});

	it('flattens a cumulative-snapshot stream into deltas', async () => {
		const source = readableToAsyncIterable(streamOf('Hallo', 'Hallo Lucy', 'Hallo Lucy!'));
		expect(await collect(toDeltas(source))).toEqual(['Hallo', ' Lucy', '!']);
	});

	it('reassembles to the same text either way', async () => {
		const cumulative = await collect(
			toDeltas(readableToAsyncIterable(streamOf('Ich', 'Ich war', 'Ich war dort')))
		);
		const deltas = await collect(
			toDeltas(readableToAsyncIterable(streamOf('Ich', ' war', ' dort')))
		);
		expect(cumulative.join('')).toBe('Ich war dort');
		expect(deltas.join('')).toBe('Ich war dort');
	});

	it('drops empty chunks', async () => {
		const source = readableToAsyncIterable(streamOf('a', '', 'b'));
		expect(await collect(toDeltas(source))).toEqual(['a', 'b']);
	});

	it('treats a repeated identical chunk as a delta, not a snapshot', async () => {
		// "ja" then "ja" is genuinely ambiguous; only a strictly longer chunk counts as cumulative,
		// so a stuttering model still produces both tokens rather than swallowing one.
		const source = readableToAsyncIterable(streamOf('ja', 'ja'));
		expect(await collect(toDeltas(source))).toEqual(['ja', 'ja']);
	});
});

describe('throwIfAborted', () => {
	it('does nothing for a live or absent signal', () => {
		expect(() => throwIfAborted(undefined)).not.toThrow();
		expect(() => throwIfAborted(new AbortController().signal)).not.toThrow();
	});

	it('throws the abort reason when already aborted', () => {
		const controller = new AbortController();
		const reason = new Error('nope');
		controller.abort(reason);
		expect(() => throwIfAborted(controller.signal)).toThrow(reason);
	});

	it('throws an AbortError when no reason was given', () => {
		const controller = new AbortController();
		controller.abort();
		expect(() => throwIfAborted(controller.signal)).toThrow(/abort/i);
	});
});
