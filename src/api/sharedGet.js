import axiosInstance from '../services/axiosInstance';

/**
 * One request for the same public lookup, however many components ask for it.
 *
 * The header / footer / homepage configs, the holiday types and the geo lookups (countries,
 * destinations) were each fetched two or three times per page: the navbar, the footer, the logo
 * hook, the cookie banner and the search sidebar all asked on their own. This shares them:
 *
 *   - identical GETs in flight at the same time share ONE request;
 *   - an answer is kept for `ttlMs` (60 s: the window the admin now allows browsers), so a
 *     component mounting a moment later reuses it instead of asking again.
 *
 * Opt-in, and only for public reference data that is the same for every visitor. Personal data
 * (account, bookings, favourites) never goes through here. A failed request is not kept.
 */
// Tests mock axios per test, so there an answer is never kept (in-flight sharing still applies).
const DEFAULT_TTL_MS = import.meta.env?.MODE === 'test' ? 0 : 60_000;
const answers = new Map();   // key → { at, data }
const inflight = new Map();  // key → Promise

const keyOf = (url, params) => {
  if (!params) return url;
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return `${url}?${sorted}`;
};

const retryable = (err) => !err?.response || err.response.status >= 500;

// The last good answer per key, kept in the browser between visits (public reference data only).
const COPY_PREFIX = 'sunsky.shared.v1:';
function saveCopy(key, data) {
  try {
    const text = JSON.stringify(data);
    if (text.length < 300_000) localStorage.setItem(COPY_PREFIX + key, text);
  } catch { /* storage full or blocked: the copy is a nicety */ }
}
function readCopy(key) {
  try {
    const text = localStorage.getItem(COPY_PREFIX + key);
    return text == null ? undefined : JSON.parse(text);
  } catch { return undefined; }
}

/** GET `url` (with `params`) once, shared. Resolves to the response body (`response.data`). */
export function sharedGet(url, { params = null, ttlMs = DEFAULT_TTL_MS, force = false } = {}) {
  const key = keyOf(url, params);
  const hit = answers.get(key);
  if (!force && hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.data);
  if (!force && inflight.has(key)) return inflight.get(key);
  const once = () => (params ? axiosInstance.get(url, { params }) : axiosInstance.get(url));
  const remember = (res) => {
    answers.set(key, { at: Date.now(), data: res.data });
    saveCopy(key, res.data);
    return res.data;
  };
  // A timeout, a dropped connection or a 5xx is worth one more try; a 4xx is an answer.
  // With a copy saved from an earlier visit the page uses it at once (the real cards, never the
  // built-in demo ones) while the retry refreshes it in the background.
  const p = once()
    .then(remember)
    .catch((err) => {
      if (!retryable(err)) throw err;
      const retry = once().then(remember);
      const saved = readCopy(key);
      if (saved !== undefined) { retry.catch(() => {}); return saved; }
      return retry;
    })
    .finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

/** Forget every shared answer — for tests, and after anything that re-reads the CMS. */
export function clearSharedGet() { answers.clear(); inflight.clear(); }

export default sharedGet;
