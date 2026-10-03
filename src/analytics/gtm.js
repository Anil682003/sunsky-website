/**
 * The Google Tag Manager container, loaded once and only after consent.
 *
 * THE SCRIPT IS INJECTED HERE, NOT PUT IN index.html. Same rule, and the same reasoning, as
 * `components/Trustpilot/loadTrustpilot.js`: GTM is a third party that sets cookies and
 * reports the page back, so nothing of it may reach the page before the visitor has agreed.
 * The project's standing rule names tag managers specifically, and
 * `src/test/preConsent.test.jsx` fails the build if a foreign script appears pre-consent.
 *
 * Moving this into <head> "for speed" would load GTM on first paint for every visitor and
 * silently break the consent gate. That is a tempting optimisation, which is why this comment
 * is here.
 *
 * NO <noscript> IFRAME. The usual GTM snippet pairs the script with a `googletagmanager.com/ns.html`
 * iframe for users without JavaScript. It is omitted on purpose: this is a React SPA, so a
 * visitor without JavaScript sees no site to measure, and the iframe would be a third-party
 * frame on the page before any consent code could run.
 */

import { GTM_SCRIPT_URL, GTM_ENABLED, DATA_LAYER_NAME, GTM_CONTAINER_ID } from './config';
import { getDataLayer } from './dataLayer';

let loadPromise = null;
let injected = null;

/**
 * Load the container. Resolves true when the script is in and running, false otherwise.
 *
 * The promise itself is the cache, not the result, so two callers in the same tick await one
 * request instead of racing to start two.
 */
export function loadGtm() {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    if (!GTM_ENABLED) { resolve(false); return; }
    if (typeof window === 'undefined' || typeof document === 'undefined') { resolve(false); return; }
    if (window.google_tag_manager?.[GTM_CONTAINER_ID]) { resolve(true); return; }

    // GTM's own snippet pushes this before the container loads; its container-load trigger
    // and some templates read it. Queued into the array ahead of the script, as GTM expects.
    const dl = getDataLayer();
    if (dl) dl.push({ 'gtm.start': Date.now(), event: 'gtm.js' });

    const el = document.createElement('script');
    el.src = GTM_SCRIPT_URL;
    el.async = true;
    // No `integrity`. A container's contents change every time someone edits a tag in the
    // GTM UI, so a pinned hash would break measurement on SUNSKY's next publish rather than
    // protect anybody.
    el.setAttribute('data-sunsky-gtm', '1');
    el.onload = () => resolve(true);
    // Adblockers, offline, CSP, a container that does not exist. A blocked tag manager is an
    // ordinary outcome and not an error: §25 requires the site to carry on regardless.
    el.onerror = () => resolve(false);
    injected = el;
    document.head.appendChild(el);
  });

  return loadPromise;
}

/**
 * Drop the script tag and forget the cache.
 *
 * Tidiness only. By the time consent is withdrawn the container runtime is already in the
 * page and cannot be called back, so ConsentContext's reload is what actually removes it -
 * exactly as with Trustpilot.
 */
export function unloadGtm() {
  if (injected?.parentNode) injected.parentNode.removeChild(injected);
  injected = null;
  loadPromise = null;
}

/** True once the container has actually booted in this page. */
export function isGtmLoaded() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.google_tag_manager?.[GTM_CONTAINER_ID]);
}

/** Test seam: forget the cached promise so a suite controls what the next call does. */
export function __resetGtmLoader() {
  injected = null;
  loadPromise = null;
  if (typeof window !== 'undefined') {
    delete window.google_tag_manager;
    delete window[DATA_LAYER_NAME];
  }
}
