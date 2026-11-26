import { roundSelling } from './pricingRounding';

/**
 * Selling-price rounding (rule 10), under Pricing Rules → Pricing Logic since 26 Nov 2026
 * (utils/pricingRounding.js). Without a rule on the page it is exactly what it always was:
 *
 *   - Round UP to a whole euro, once.
 *   - Hotel only: the unit is ONE ROOM'S STAY (each room's stay rounded up, times rooms).
 *   - Package: hotel + flight is rounded once, as a whole — from the EXACT hotel price
 *     (the cache's `totalAmountUnrounded`), never from an already-rounded one.
 *   - Per person is a display figure derived from the rounded total, rounded up again.
 *
 * SunSkyCache (utils/price-rounding.js) and sunsky-admin (utils/priceRounding.js) carry the
 * same helpers. The card price, the hotel page's cache-vs-live comparison and the amount the
 * admin charges must all agree, so keep the three copies identical.
 */

/**
 * A selling price under the rounding in force: Pricing Logic's rule when the admin switched it on,
 * else up to a whole euro. Snapped to cents first so float noise (256.00000000000003) can't add €1.
 * (The name is kept: every caller rounds a selling price through it.)
 */
export function ceilEuro(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return n;
  return roundSelling(n);
}

/** Hotel-only stay total: each room's stay rounded up, times the room count. */
export function roundHotelStay(exactTotal, rooms = 1) {
  const r = Math.max(1, Math.floor(Number(rooms) || 1));
  return ceilEuro(Number(exactTotal) / r) * r;
}

/** Package total: exact hotel + exact flight, rounded up once. */
export function roundPackage(exactHotel, exactFlight) {
  return ceilEuro((Number(exactHotel) || 0) + (Number(exactFlight) || 0));
}

/**
 * The stay total a quote is charged at: a package when a flight is part of it, otherwise the
 * hotel alone per room. `exactFlight` null/0 → hotel only.
 */
export function roundStayTotal(exactHotel, exactFlight, rooms = 1) {
  return Number(exactFlight) > 0
    ? roundPackage(exactHotel, exactFlight)
    : roundHotelStay(exactHotel, rooms);
}

/** Per-person display figure from an already-rounded total. */
export function perPersonFrom(roundedTotal, pax) {
  return ceilEuro(Number(roundedTotal) / Math.max(1, Number(pax) || 1));
}
