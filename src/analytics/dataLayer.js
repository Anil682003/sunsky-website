/**
 * The dataLayer itself: the one place anything is pushed to Google.
 *
 * Tracking Master §2 ("SUNSKY -> dataLayer -> Google Tag Manager -> GA4 / Google Ads") and
 * §21 ("Parallel duplicate GA4/Google Ads event tracking outside GTM must not be
 * implemented"). Nothing in this codebase may call gtag() or fire a pixel directly. Every
 * event goes through `push()` here, reaches GTM, and GTM decides what to do with it.
 *
 * TWO GATES, AND THEY ARE NOT THE SAME ONE.
 *
 *   1. CONFIGURATION. No GTM container id at build time -> nothing is tracked at all.
 *   2. CONSENT. A visitor who has not granted `analytics` or `marketing` gets no event
 *      pushed, not merely a denied Consent Mode signal.
 *
 * Gate 2 is stricter than Google's own recommendation, and deliberately so. GTM replays the
 * WHOLE existing dataLayer array from index 0 the moment its container loads. If pre-consent
 * events were buffered in the array, a visitor who browsed three pages and only then accepted
 * would have those three pages uploaded retroactively - collection of activity that happened
 * before consent existed. Dropping them is the only way "no" means no.
 *
 * Tracking Master §25: "If GTM, GA4, Google Ads or another marketing service fails to load,
 * SUNSKY must continue functioning normally." Every function here is wrapped so a thrown
 * error inside analytics can never reach a booking code path.
 */

import { DATA_LAYER_NAME, GTM_ENABLED, TRACKING_ENV } from './config';

/**
 * Whether the visitor has granted something that permits event collection.
 *
 * Module state rather than React state because the checkout pushes `purchase` from inside an
 * async payment handler, where there is no component to read a context from, and because an
 * event must never be delayed by a re-render.
 */
let collectionAllowed = false;

/** Set by <Analytics /> whenever the consent record changes. */
export function setCollectionAllowed(allowed) {
  collectionAllowed = Boolean(allowed);
}

export function isCollectionAllowed() {
  return collectionAllowed;
}

/**
 * The array itself, created on demand.
 *
 * Creating it is safe before consent: it is a plain JavaScript array on `window`, it sets no
 * cookie, it makes no request, and nothing reads it until a container loads. Consent Mode's
 * default command has to be queued into it BEFORE the container script is appended, which is
 * the whole reason it can exist that early.
 */
export function getDataLayer() {
  if (typeof window === 'undefined') return null;
  if (!Array.isArray(window[DATA_LAYER_NAME])) window[DATA_LAYER_NAME] = [];
  return window[DATA_LAYER_NAME];
}

/**
 * Push a raw entry, bypassing the consent gate.
 *
 * ONLY for Google Consent Mode's own `consent` commands. Those exist precisely to tell Google
 * that permission is absent, so gating them behind permission would be circular - and the
 * default command must be in the array before the container loads or the container starts up
 * with no defaults at all. They carry no user or page data.
 */
export function pushConsentCommand() {
  try {
    const dl = getDataLayer();
    if (!dl) return false;
    // Consent Mode expects the `arguments` OBJECT, not an array. gtag.js tests for an
    // array-like with a numeric length and ignores a real Array, so `[...arguments]` or a
    // rest parameter would push something that silently never applies. This is why the
    // function takes no declared parameters.
    dl.push(arguments);
    return true;
  } catch {
    return false;
  }
}

/**
 * Push a funnel event. Returns true when it actually went into the array.
 *
 * Adds `tracking_environment` to everything (Tracking Master §25) so GTM can hold the
 * production GA4 and Google Ads tags back on development and UAT traffic rather than relying
 * on anyone remembering to point a test build at a different container.
 */
export function push(entry) {
  try {
    if (!GTM_ENABLED) return false;
    if (!collectionAllowed) return false;
    if (!entry || typeof entry !== 'object') return false;

    const dl = getDataLayer();
    if (!dl) return false;

    dl.push({ ...entry, tracking_environment: TRACKING_ENV });
    return true;
  } catch {
    // Analytics may never break a booking. Swallow and carry on.
    return false;
  }
}

/**
 * Tracking Master §10, §11, §12, and rule 5 in §29: clear the previous ecommerce object
 * before pushing a new ecommerce event.
 *
 * Without this, GA4 merges the previous event's `items` into the next one, so a purchase
 * inherits whatever the begin_checkout left behind.
 */
export function resetEcommerce() {
  try {
    if (!GTM_ENABLED || !collectionAllowed) return false;
    const dl = getDataLayer();
    if (!dl) return false;
    dl.push({ ecommerce: null });
    return true;
  } catch {
    return false;
  }
}

/** Test seam: forget the permission flag between cases. */
export function __resetDataLayerState() {
  collectionAllowed = false;
  if (typeof window !== 'undefined') delete window[DATA_LAYER_NAME];
}
