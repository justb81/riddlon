/**
 * Wires `StoryEngine.resume()` (#9) to the two browser signals that approximate "app
 * open/resume/foreground" in an offline PWA (docs/arc42 §8.1.6): the page regaining
 * visibility (tab/app switch back) and `pageshow`'s bfcache-restore case. Deliberately
 * NOT a service-worker background sync or a `setTimeout` — those aren't load-bearing per
 * §8.1.6/§3.3, this is the opportunistic on-resume check the doc actually specifies.
 *
 * Callers own the `StoryEngine` instance — there is no engine singleton yet; wiring one up
 * for the live UI is #14-#17's job once a package can actually be installed and played.
 */
import { browser } from '$app/environment';

/** Returns a cleanup function that removes the listeners. Inert (no-op cleanup) outside the browser. */
export function watchForResume(onResume: () => void): () => void {
	if (!browser) return () => {};

	const handleVisibilityChange = (): void => {
		if (document.visibilityState === 'visible') onResume();
	};
	const handlePageShow = (event: PageTransitionEvent): void => {
		if (event.persisted) onResume();
	};

	document.addEventListener('visibilitychange', handleVisibilityChange);
	window.addEventListener('pageshow', handlePageShow);

	return () => {
		document.removeEventListener('visibilitychange', handleVisibilityChange);
		window.removeEventListener('pageshow', handlePageShow);
	};
}
