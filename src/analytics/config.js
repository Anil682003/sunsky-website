/**
 * What the marketing layer was configured with at build time.
 *
 * PURE and side-effect free, so every other module in here can be unit-tested by mocking
 * this one file.
 *
 * Spec: "GOOGLE ADS, GA4 & MARKETING TRACKING - Technical Specification v1.0 FINAL"
 * (referred to below as the Tracking Master, by section number).
 *
 * NOTHING IS BAKED IN. Until `VITE_GTM_CONTAINER_ID` is set at build time, `GTM_ENABLED` is
 * false, no container is ever injected, the `analytics` and `marketing` consent categories
 * stay dormant, and the four funnel events are dropped. That is deliberate: the site must be
 * deployable with this code present and completely inert, because the production container id
 * is SUNSKY's to issue and the cookie notice may not advertise a category that nothing uses.
 */

const env = import.meta.env || {};

/**
 * Treat the placeholder values a half-filled .env leaves behind as "not configured".
 * Mirrors how VITE_STRIPE_PUBLIC_KEY is handled: a key containing REPLACE is skipped rather
 * than sent to Stripe.
 */
const real = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/replace|your[-_]?|xxx|todo|placeholder/i.test(s)) return '';
  return s;
};

/** GTM-XXXXXX. The only container the site will ever load. */
export const GTM_CONTAINER_ID = (() => {
  const id = real(env.VITE_GTM_CONTAINER_ID);
  // A typo here means a silent no-op in production, so be strict about the shape rather than
  // injecting a script tag for a container that cannot exist.
  return /^GTM-[A-Z0-9]{4,}$/i.test(id) ? id.toUpperCase() : '';
})();

/**
 * Tracking Master §25: DEVELOPMENT / UAT / PRODUCTION must be separable, and
 * "Development and UAT activity must not contaminate production analytics or advertising
 * conversions."
 *
 * This travels on every event as `tracking_environment` so GTM can hold back the production
 * GA4 and Google Ads tags on anything that is not `production`. The default is `development`,
 * which fails safe: an unconfigured build cannot post to the live property by accident.
 */
export const TRACKING_ENV = (() => {
  const v = real(env.VITE_TRACKING_ENV).toLowerCase();
  return ['development', 'uat', 'production'].includes(v) ? v : 'development';
})();

/** True when there is a container to load. Everything else in this module keys off it. */
export const GTM_ENABLED = GTM_CONTAINER_ID !== '';

/**
 * The container URL.
 *
 * `VITE_GTM_SERVER_URL` is optional and supports a server-side/first-party GTM endpoint if
 * SUNSKY ever moves to one. Unset, this is Google's standard host.
 */
export const GTM_SCRIPT_URL = (() => {
  if (!GTM_ENABLED) return '';
  const host = real(env.VITE_GTM_SERVER_URL) || 'https://www.googletagmanager.com';
  return `${host.replace(/\/+$/, '')}/gtm.js?id=${encodeURIComponent(GTM_CONTAINER_ID)}`;
})();

/** The global the dataLayer lives on. Configurable only because GTM itself allows renaming it. */
export const DATA_LAYER_NAME = real(env.VITE_GTM_DATA_LAYER) || 'dataLayer';
