/**
 * The four funnel events, and nothing else.
 *
 * Tracking Master §8: "SUNSKY uses only four core funnel events: search, view_item,
 * begin_checkout, purchase. No additional marketing events are required for Phase 1 unless
 * later explicitly approved by SUNSKY." §26 lists what is deliberately excluded - filter
 * changes, calendar opens, live checks, payment methods, add_to_cart, select_item, login.
 * Adding one here is a spec change, not a code change.
 *
 * Every exported function takes the data SUNSKY already holds (Tracking Master §3: "Developers
 * must not create duplicate manual Google Ads fields for information already available in
 * SUNSKY"), canonicalises it, drops what does not apply, and pushes. None of them throws, and
 * none of them is allowed to be on a code path that could block a booking (§25).
 */

import {
  productType, boardType, isoDate, airport, money, count, text, hotelId, compact,
} from './canonical';
import { push, resetEcommerce } from './dataLayer';

/* ─────────────────────────── shared shape ─────────────────────────── */

/**
 * The dimensions every event carries, per the minimum dataset table in Tracking Master §5.
 *
 * HOTEL_ONLY gets no `departure_airport` (§16: "Do not create departure_airport for
 * HOTEL_ONLY") and FLIGHT_ONLY gets no hotel fields or board (§17). Those are not merely
 * omitted when empty - they are suppressed even when the value happens to be known, because
 * the shape of the event is part of the contract.
 *
 * §5: "For HOTEL_ONLY, departure_date always means the hotel check-in date." The caller passes
 * `departureDate` already resolved to whichever that product's date is; this layer does not
 * second-guess it.
 *
 * §5: "Tracking must use the canonical duration already determined by SUNSKY. The marketing
 * layer must not independently calculate travel duration." `duration` is passed in, never
 * derived here from the two dates.
 */
function baseFields(ctx = {}) {
  const type = productType(ctx);
  if (!type) return null;

  const isHotel = type === 'FLIGHT_HOTEL' || type === 'HOTEL_ONLY';
  const wantsAirport = type === 'FLIGHT_HOTEL' || type === 'FLIGHT_ONLY';

  return {
    product_type: type,
    country: text(ctx.country),
    destination: text(ctx.destination),
    hotel_id: isHotel ? hotelId(ctx.hotelCode) : null,
    hotel_name: isHotel ? text(ctx.hotelName) : null,
    departure_date: isoDate(ctx.departureDate),
    departure_airport: wantsAirport ? airport(ctx.departureAirport) : null,
    duration: count(ctx.duration, { min: 1 }),
    adults: count(ctx.adults, { min: 0 }),
    children: count(ctx.children, { min: 0 }),
    board_type: isHotel ? boardType(ctx.board) : null,
  };
}

/**
 * The single ecommerce item for a SUNSKY product.
 *
 * Tracking Master §12 and rule 6 in §29: "One SUNSKY travel product/booking is represented as
 * one ecommerce item with quantity = 1", and rule 10: "ecommerce.value must equal the tracked
 * item price". One trip is one line, whatever it is assembled from - never one item for the
 * hotel and another for the flight.
 *
 * §17: for FLIGHT_ONLY, "never invent an item_id if no stable SUNSKY identifier exists. Use a
 * consistent descriptive item_name instead."
 */
function ecommerceItem(ctx, type, value) {
  const isHotel = type === 'FLIGHT_HOTEL' || type === 'HOTEL_ONLY';

  const id = isHotel ? hotelId(ctx.hotelCode) : text(ctx.flightProductId);
  const name = isHotel
    ? text(ctx.hotelName)
    // A stable, readable fallback: "BRU-Barcelona", exactly the §17 example.
    : (text(ctx.flightProductName)
      || [airport(ctx.departureAirport), text(ctx.destination)].filter(Boolean).join('-')
      || null);

  // An item with neither an id nor a name describes nothing and is worse than no item array.
  if (!id && !name) return null;

  return compact({
    item_id: id,
    item_name: name,
    item_category: type,
    price: value,
    quantity: 1,
  });
}

/* ─────────────────────────── search ─────────────────────────── */

/**
 * Tracking Master §9. Fires when the visitor performs a real search, or reloads one with
 * changed criteria.
 *
 * It explicitly must NOT fire when the visitor opens the calendar, opens a filter, changes
 * sorting, opens an airport selector, or edits an input before submitting. Sorting is the one
 * worth spelling out: it reorders a result set without changing what was searched for, so it
 * is not a new search. Keeping that promise is the caller's job - see `searchSignature()`,
 * which is what Results.jsx keys on.
 *
 * No ecommerce block: §9's example carries search dimensions only.
 */
export function trackSearch(ctx = {}) {
  const base = baseFields(ctx);
  if (!base) return false;
  return push(compact({ event: 'search', ...base }));
}

/**
 * The criteria that make a search a different search.
 *
 * Deliberately excludes sort order and page/cursor: §9 rules both out as triggers. Any change
 * to this string is a new `search` event; anything not in it is presentation.
 */
export function searchSignature(ctx = {}) {
  const base = baseFields(ctx);
  if (!base) return null;
  return JSON.stringify([
    base.product_type, base.country, base.destination, base.departure_date,
    base.departure_airport, base.duration, base.adults, base.children, base.board_type,
    // Filters that genuinely narrow the search universe rather than reorder it.
    text(ctx.filterSignature),
  ]);
}

/* ─────────────────────────── view_item ─────────────────────────── */

/**
 * Tracking Master §10. Fires when the visitor opens a specific hotel or product detail.
 *
 * The §10 example carries no `value`, and none is sent: at the moment a hotel page opens the
 * only number available is a from-price for a party that may not be the visitor's. §11 bans
 * exactly that kind of stale number from `begin_checkout`, and sending it here would seed
 * GA4's item revenue with it.
 */
export function trackViewItem(ctx = {}) {
  const base = baseFields(ctx);
  if (!base) return false;

  const item = ecommerceItem(ctx, base.product_type, null);
  if (!item) return false;

  resetEcommerce();
  return push(compact({
    event: 'view_item',
    ...base,
    ecommerce: { items: [item] },
  }));
}

/* ─────────────────────────── begin_checkout ─────────────────────────── */

/**
 * Tracking Master §11. Fires when the visitor proceeds into checkout with a selected valid
 * offer.
 *
 * §11: "The value must represent the actual selected offer entering checkout. Do not use an
 * obsolete from-price, cache price, previous result price or alternative offer price."
 * The caller passes the total the checkout is really about to charge.
 *
 * Returns false without pushing when there is no usable value: a checkout event with no money
 * on it is worse than none, because it enters GA4's funnel and dilutes the conversion rate
 * while contributing nothing to value.
 */
export function trackBeginCheckout(ctx = {}) {
  const base = baseFields(ctx);
  if (!base) return false;

  const value = money(ctx.value);
  if (value == null) return false;

  const item = ecommerceItem(ctx, base.product_type, value);
  if (!item) return false;

  resetEcommerce();
  return push(compact({
    event: 'begin_checkout',
    ...base,
    ecommerce: {
      value,
      currency: 'EUR',
      items: [item],
    },
  }));
}

/* ─────────────────────────── purchase ─────────────────────────── */

/**
 * Where the transaction ids already reported live.
 *
 * localStorage, not sessionStorage: §15 requires that "refreshing or reopening the
 * confirmation must not generate a new purchase", and a confirmation page can be reopened
 * from an email days later in a brand new session. sessionStorage would have forgotten.
 */
const SENT_KEY = 'sunsky_purchase_sent';
/** Bounded so the entry cannot grow without limit on a shared machine. */
const SENT_MAX = 50;

function readSent() {
  try {
    const raw = window.localStorage.getItem(SENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((v) => typeof v === 'string') : [];
  } catch {
    // Private mode, blocked storage, corrupt value. Fall through to "nothing recorded".
    return [];
  }
}

function rememberSent(id) {
  try {
    const next = [...readSent().filter((v) => v !== id), id].slice(-SENT_MAX);
    window.localStorage.setItem(SENT_KEY, JSON.stringify(next));
  } catch {
    /* Storage unavailable. The in-page guard below still prevents a double push per load. */
  }
}

/** Second line of defence for the case where localStorage throws on every call. */
const sentThisLoad = new Set();

/** True when this booking reference has already been reported as a purchase. */
export function purchaseAlreadySent(transactionId) {
  const id = text(transactionId);
  if (!id) return false;
  return sentThisLoad.has(id) || readSent().includes(id);
}

/**
 * Tracking Master §12. SUNSKY's primary marketing conversion.
 *
 * THE CONDITIONS IN §15 ARE THE POINT OF THIS FUNCTION, not a detail of it. `purchase` must
 * not fire when checkout opens, when payment is merely initiated, when payment fails, WHEN
 * THE SUPPLIER BOOKING FAILS, when the booking is rejected, on a technical error, when the
 * customer returns to checkout, or when an existing confirmation is revisited.
 *
 * Two of those are enforced here and the rest at the call site:
 *   - a missing `transactionId` means no confirmed SUNSKY booking reference exists yet;
 *   - a repeat of an id already reported is dropped.
 *
 * The caller must not call this at all while the supplier reservation is pending. In
 * Checkout.jsx that is the `reservationPending` flag, and in CheckoutReturn.jsx it is the
 * 'pending' status - both mean payment succeeded but the supplier did not confirm, which §15
 * lists as "supplier booking fails".
 *
 * §13: the value is what the customer pays SUNSKY, excluding amounts payable locally at the
 * destination. §14: the FINAL CONFIRMED booking value wins over any earlier search,
 * live-check or checkout figure.
 */
export function trackPurchase(ctx = {}) {
  const base = baseFields(ctx);
  if (!base) return false;

  const transactionId = text(ctx.transactionId);
  if (!transactionId) return false;
  if (purchaseAlreadySent(transactionId)) return false;

  const value = money(ctx.value);
  if (value == null) return false;

  const item = ecommerceItem(ctx, base.product_type, value);
  if (!item) return false;

  resetEcommerce();
  const ok = push(compact({
    event: 'purchase',
    ...base,
    ecommerce: {
      transaction_id: transactionId,
      value,
      currency: 'EUR',
      items: [item],
    },
  }));

  // Recorded only on a push that actually happened, so a visitor who books before consenting
  // is not permanently barred from a later, legitimate purchase event.
  if (ok) {
    sentThisLoad.add(transactionId);
    rememberSent(transactionId);
  }
  return ok;
}

/** Test seam: forget what this page load has already reported. */
export function __resetPurchaseGuard() {
  sentThisLoad.clear();
  try { window.localStorage.removeItem(SENT_KEY); } catch { /* nothing to clear */ }
}
