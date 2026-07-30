// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	// Injected by vite.config.ts's `define` from package.json's version at build time.
	const __APP_VERSION__: string;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// Window Controls Overlay isn't in TypeScript's lib.dom.d.ts yet (Chromium-only, experimental).
	// Used by `$lib/state/windowChrome.svelte.ts` to let an installed desktop PWA draw into the titlebar.
	interface WindowControlsOverlayGeometryChangeEvent extends Event {
		readonly titlebarAreaRect: DOMRect;
		readonly visible: boolean;
	}

	interface WindowControlsOverlay extends EventTarget {
		readonly visible: boolean;
		getTitlebarAreaRect(): DOMRect;
		addEventListener(
			type: 'geometrychange',
			listener: (event: WindowControlsOverlayGeometryChangeEvent) => void
		): void;
		removeEventListener(
			type: 'geometrychange',
			listener: (event: WindowControlsOverlayGeometryChangeEvent) => void
		): void;
	}

	interface Navigator {
		readonly windowControlsOverlay?: WindowControlsOverlay;
	}
}

export {};
