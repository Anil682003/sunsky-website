/**
 * Carrying the purchase context across a redirect payment.
 *
 * THE PROBLEM. Bancontact, iDEAL and PayPal send the customer to their bank and back to
 * `/checkout/return`, which is a fresh page load with none of the checkout's React state.
 * All it is handed is a `bookingId`. The stored booking it reads back is normalised across
 * product rows, so the country, destination, board and canonical duration that
 * `purchase` needs (Tracking Master §5) are not recoverable from it without guessing at the
 * shape of a `productDetails` JSON column - and a guess that drifts would silently corrupt
 * the product dimension on every Belgian payment method, which is most of them.
 *
 * WHY NOT THE URL. Putting destination, dates and traveller counts in the return URL would
 * write a customer's trip into browser history, server logs and the payment provider's
 * referrer. sessionStorage stays in the tab, dies with it, and never leaves the browser.
 *
 * WHY sessionStorage AND NOT localStorage. This is in-flight state for one payment in one
 * tab, not a record. If the customer abandons the redirect, it should disappear with the tab
 * rather than sit around waiting to be attached to some later booking.
 */

const KEY = 'sunsky_pending_purchase';

/** Written just before handing control to Stripe. */
export function stashPurchaseContext(bookingId, context) {
  try {
    if (!bookingId || !context) return false;
    window.sessionStorage.setItem(KEY, JSON.stringify({ bookingId: String(bookingId), context }));
    return true;
  } catch {
    // Private mode or blocked storage. The return page falls back to what it can read off
    // the stored booking; a thinner event is better than a broken payment.
    return false;
  }
}

/**
 * Read it back, but only for the booking that is actually returning.
 *
 * The id check matters: a customer who abandons one redirect and starts another would
 * otherwise have the first trip's context attached to the second booking's reference.
 */
export function readPurchaseContext(bookingId) {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || String(parsed.bookingId) !== String(bookingId)) return null;
    return parsed.context || null;
  } catch {
    return null;
  }
}

/** Cleared once the purchase has been reported, or the payment has definitively failed. */
export function clearPurchaseContext() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
