import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ENDPOINT_STORAGE_KEY,
	clearEndpointConfig,
	endpointHostLabel,
	getEndpointConfig,
	hasEndpointConfig,
	isLocalEndpoint,
	normalizeBaseUrl,
	parseEndpointConfig,
	setEndpointConfig
} from './endpoint-config.js';

vi.mock('$app/environment', () => ({ browser: true }));

/** Enough of the Storage interface for the four browser-guarded functions. */
function installLocalStorage(): Map<string, string> {
	const store = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, value),
		removeItem: (key: string) => void store.delete(key)
	});
	return store;
}

describe('normalizeBaseUrl', () => {
	it('strips trailing slashes', () => {
		expect(normalizeBaseUrl('http://localhost:11434/v1/')).toBe('http://localhost:11434/v1');
		expect(normalizeBaseUrl('  http://localhost:11434/v1//  ')).toBe('http://localhost:11434/v1');
	});

	it('strips a pasted /chat/completions path, which we append ourselves', () => {
		expect(normalizeBaseUrl('https://api.example.com/v1/chat/completions')).toBe(
			'https://api.example.com/v1'
		);
		expect(normalizeBaseUrl('https://api.example.com/v1/chat/completions/')).toBe(
			'https://api.example.com/v1'
		);
	});

	it('leaves an already-clean base URL alone', () => {
		expect(normalizeBaseUrl('https://api.example.com/v1')).toBe('https://api.example.com/v1');
	});
});

describe('parseEndpointConfig', () => {
	it('reads a full record and normalises the base URL', () => {
		const raw = JSON.stringify({ baseUrl: 'http://localhost:11434/v1/', model: ' llama3.2 ' });
		expect(parseEndpointConfig(raw)).toEqual({
			baseUrl: 'http://localhost:11434/v1',
			model: 'llama3.2'
		});
	});

	it('keeps an API key when one is stored, and omits an empty one', () => {
		const withKey = JSON.stringify({ baseUrl: 'https://a.example/v1', model: 'm', apiKey: 'sk-1' });
		expect(parseEndpointConfig(withKey)?.apiKey).toBe('sk-1');

		const blankKey = JSON.stringify({ baseUrl: 'https://a.example/v1', model: 'm', apiKey: '  ' });
		expect(parseEndpointConfig(blankKey)).not.toHaveProperty('apiKey');
	});

	it('treats a half-filled record as not configured', () => {
		// Otherwise an empty settings form would outrank a local model that actually works.
		expect(
			parseEndpointConfig(JSON.stringify({ baseUrl: 'https://a.example/v1' }))
		).toBeUndefined();
		expect(parseEndpointConfig(JSON.stringify({ model: 'llama3.2' }))).toBeUndefined();
		expect(
			parseEndpointConfig(JSON.stringify({ baseUrl: '   ', model: 'llama3.2' }))
		).toBeUndefined();
	});

	it('survives absent, malformed and non-object payloads', () => {
		expect(parseEndpointConfig(null)).toBeUndefined();
		expect(parseEndpointConfig('')).toBeUndefined();
		expect(parseEndpointConfig('{not json')).toBeUndefined();
		expect(parseEndpointConfig('"a string"')).toBeUndefined();
		expect(parseEndpointConfig('null')).toBeUndefined();
	});
});

describe('endpointHostLabel', () => {
	it('reports host and port', () => {
		expect(endpointHostLabel('http://localhost:11434/v1')).toBe('localhost:11434');
		expect(endpointHostLabel('https://api.example.com/v1')).toBe('api.example.com');
	});

	it('falls back to the raw string when the URL cannot be parsed', () => {
		expect(endpointHostLabel('not a url')).toBe('not a url');
	});
});

describe('isLocalEndpoint', () => {
	it('recognises loopback and private-network hosts', () => {
		for (const url of [
			'http://localhost:11434/v1',
			'http://127.0.0.1:8080/v1',
			'http://[::1]:8080/v1',
			'http://192.168.1.50:1234/v1',
			'http://10.0.0.4/v1',
			'http://172.16.0.9/v1',
			'http://mini.local:11434/v1'
		]) {
			expect(isLocalEndpoint(url)).toBe(true);
		}
	});

	it('treats public hosts, and unparseable input, as remote', () => {
		expect(isLocalEndpoint('https://api.openai.com/v1')).toBe(false);
		expect(isLocalEndpoint('http://172.32.0.1/v1')).toBe(false);
		expect(isLocalEndpoint('nonsense')).toBe(false);
	});
});

describe('storage round-trip', () => {
	beforeEach(() => {
		installLocalStorage();
	});

	it('stores, reads back and clears a configuration', () => {
		expect(hasEndpointConfig()).toBe(false);

		setEndpointConfig({ baseUrl: 'http://localhost:11434/v1/', model: 'llama3.2' });
		expect(getEndpointConfig()).toEqual({
			baseUrl: 'http://localhost:11434/v1',
			model: 'llama3.2'
		});
		expect(hasEndpointConfig()).toBe(true);

		clearEndpointConfig();
		expect(getEndpointConfig()).toBeUndefined();
	});

	it('writes under the key reset.ts carves out', () => {
		const store = installLocalStorage();
		setEndpointConfig({ baseUrl: 'https://a.example/v1', model: 'm', apiKey: 'sk-1' });
		expect(store.has(ENDPOINT_STORAGE_KEY)).toBe(true);
	});

	it('reports a corrupted record as unconfigured rather than throwing', () => {
		const store = installLocalStorage();
		store.set(ENDPOINT_STORAGE_KEY, '{broken');
		expect(hasEndpointConfig()).toBe(false);
	});
});
