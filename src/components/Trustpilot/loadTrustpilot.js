import { BOOTSTRAP_SRC } from './trustpilotConfig';

/**
 * The TrustBox bootstrap, loaded once and shared.
 *
 * THE SCRIPT IS INJECTED HERE, NOT PUT IN index.html. That is the whole consent gate: the
 * widget's iframe writes a `TrustboxSplitTest_*` cookie and tells Trustpilot which page the
 * visitor is on, so nothing of it may reach the page before the visitor has agreed. A tag in
 * index.html would load on first paint for everyone, which is exactly what must not happen —
 * and it is a tempting "optimisation", so this comment is here to stop it.
 *
 * The promise itself is the cache, not the result: two placements mounting in the same tick
 * both await one request instead of racing to start their own.
 */

let bootstrapPromise = null;
let injected = null;

/** Resolves true when window.Trustpilot is usable, false when it could not be loaded. */
export function loadTrustpilot() {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(false);
      return;
    }
    if (window.Trustpilot) {
      resolve(true);
      return;
    }

    const el = document.createElement('script');
    el.src = BOOTSTRAP_SRC;
    el.async = true;
    // No `integrity`: Trustpilot decline to support SRI because the bundle changes often, so a
    // pinned hash would break the widget on their next release rather than protect anyone.
    //
    // No `data-dynamic` either. It is real — it starts a document.body subtree MutationObserver
    // that auto-renders containers added later — but we call loadFromElement ourselves, and
    // each widget already brings its own observer.
    el.onload = () => resolve(Boolean(window.Trustpilot));
    // Adblockers, offline, CSP. A blocked widget is an ordinary outcome, not an error: the
    // container keeps its plain link to the real profile. Never reject.
    el.onerror = () => resolve(false);
    injected = el;
    document.head.appendChild(el);
  });

  return bootstrapPromise;
}

/**
 * Drop the script tag and forget the cache. Tidiness only — by the time consent is withdrawn
 * the runtime is already in the page, and the reload in ConsentContext is what actually
 * removes it.
 */
export function unloadTrustpilot() {
  if (injected?.parentNode) injected.parentNode.removeChild(injected);
  injected = null;
  bootstrapPromise = null;
}

/** Test seam: forget the cached promise so a suite controls what the next mount does. */
export function __resetTrustpilotLoader() {
  injected = null;
  bootstrapPromise = null;
}
