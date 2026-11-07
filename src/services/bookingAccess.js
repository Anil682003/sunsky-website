/**
 * The guest access token of an online booking (security requirement SPE-01, Nov 2026).
 *
 * The checkout works without an account. The server used to accept a booking's id alone for
 * reading, paying and confirming it, and ids are sequential, so anyone could open another
 * person's booking. Now the create call returns an `accessToken` for that one booking, and
 * every later call for it must carry the token in the X-Booking-Token header. The axios
 * interceptor (services/axiosInstance.js) adds it to any /website/online-bookings/<id> call.
 *
 * WHERE IT IS KEPT. In memory, and in localStorage so the redirect payments (Bancontact, iDEAL,
 * PayPal) find it on /checkout/return, even when the bank app opens that page in another tab.
 * Never in the URL: the return URL lands in browser history, analytics and server logs.
 * Entries expire after 7 days and only the last 10 are kept.
 */

const KEY = 'sunsky_booking_access';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 10;
export const BOOKING_TOKEN_HEADER = 'X-Booking-Token';

const memory = new Map();

function readStore() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Private mode or blocked storage: the in-memory copy still covers the card payment.
  }
}

function fresh(store, now = Date.now()) {
  const entries = Object.entries(store)
    .filter(([, v]) => v && typeof v.t === 'string' && now - Number(v.at) < MAX_AGE_MS)
    .sort((a, b) => Number(b[1].at) - Number(a[1].at))
    .slice(0, MAX_ENTRIES);
  return Object.fromEntries(entries);
}

/** Keep the token the create call returned. */
export function rememberBookingToken(bookingId, token) {
  if (!bookingId || !token) return;
  const id = String(bookingId);
  memory.set(id, token);
  // The booking just created always stays; the others fill the remaining places, newest first.
  const others = Object.fromEntries(Object.entries(readStore()).filter(([k]) => k !== id));
  const kept = Object.entries(fresh(others)).slice(0, MAX_ENTRIES - 1);
  writeStore({ ...Object.fromEntries(kept), [id]: { t: token, at: Date.now() } });
}

/** The token for this booking, or null. */
export function bookingTokenFor(bookingId) {
  if (!bookingId) return null;
  const id = String(bookingId);
  if (memory.has(id)) return memory.get(id);
  return fresh(readStore())[id]?.t || null;
}

/** The booking id in an online-booking API path, e.g. /website/online-bookings/123/confirm. */
export function bookingIdFromUrl(url) {
  const m = String(url || '').match(/\/website\/online-bookings\/(\d+)(?:[/?#]|$)/);
  return m ? m[1] : null;
}

/** Header to add to a request for this URL ({} when none applies). */
export function bookingTokenHeaders(url) {
  const token = bookingTokenFor(bookingIdFromUrl(url));
  return token ? { [BOOKING_TOKEN_HEADER]: token } : {};
}

/** Test helper. */
export function _resetBookingAccess() {
  memory.clear();
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
}
