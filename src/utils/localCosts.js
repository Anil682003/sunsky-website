/**
 * MANDATORY LOCAL COSTS (UI-09, Ch 1 §10 · Ch 2 §5 · Ch 3 §4, Master spec 2.2).
 *
 * A tourist tax or levy the hotel collects on arrival. SUNSKY does not collect it and did not set
 * it, so it is never part of a price, a total, a deposit or a payment, and it keeps its cents:
 * 12.40 stays 12.40 (spec 2.3). The pages show it under the price; nothing here adds it to one.
 *
 * One decision, three sources:
 *   - a Flight + Hotel package (`/flight-availability/packages`): `localCosts: { known, currency }`,
 *     the exact local tax of that stay and party (absent: none known)
 *   - a Hotel only cache row (`/contracts/cheapest`): `taxExcluded` (internal contracts only; the
 *     Hotelbeds cache carries no tax data)
 *   - a live rate (`/hotel-availability/search`): Hotelbeds' own `taxes`, of which only the ones
 *     with `included: false` are payable locally. Diana and W2M send none.
 *
 * The answer is one of
 *   { kind: 'known', amount, currency }         the exact amount for the whole stay and party
 *   { kind: 'range', min, max, currency, cost } not known before booking: what it is and the
 *                                               local rate p.p. per night, never a total
 *   null                                        nothing known, so the page shows nothing. Never
 *                                               "no local costs" and never € 0: unknown is not none.
 *
 * No source sends a range today. The form is here so the day one does, it reads as text.
 *
 * Pure: no React, no i18n, no network.
 */
import { localEuros } from './tripPrice';

export const LOCAL_COST = Object.freeze({ KNOWN: 'known', RANGE: 'range' });

/** The kinds of cost the locale files can name (`localCosts.cost.*`). Anything else is "other". */
export const COST_KINDS = Object.freeze(['touristTax', 'other']);

/** A number, or null. Number(null) and Number('') are 0, which is how a missing tax becomes € 0. */
const num = (v) => {
  if (v == null || v === '' || typeof v === 'boolean' || typeof v === 'object') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const ccyOf = (v) => (typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : null);

/**
 * PURE. The normaliser behind every source: `{ known, currency }` for an exact amount, or
 * `{ min, max, currency, cost }` for a range p.p. per night. Anything not positive is not a cost.
 */
export function localCost(input) {
  if (!input || typeof input !== 'object') return null;
  const currency = ccyOf(input.currency) || 'EUR';
  const known = num(input.known);
  if (known != null) {
    const amount = localEuros(known);
    return amount > 0 ? Object.freeze({ kind: LOCAL_COST.KNOWN, amount, currency }) : null;
  }
  const min = num(input.min);
  const max = num(input.max);
  // The range strings are written in euros ("ca. € 7-€ 10"), so a range in another currency
  // has no honest way to be said yet.
  if (min == null || max == null || currency !== 'EUR') return null;
  const lo = localEuros(min);
  const hi = localEuros(max);
  if (!(hi > 0) || lo < 0 || lo > hi) return null;
  const cost = COST_KINDS.includes(input.cost) ? input.cost : 'other';
  return Object.freeze({ kind: LOCAL_COST.RANGE, min: lo, max: hi, currency, cost });
}

/** PURE. A package from `/flight-availability/packages` (or one of its duration categories). */
export const localCostOfPackage = (pkg) => localCost(pkg?.localCosts);

/** PURE. A `/contracts/cheapest` row: its `taxExcluded` is payable at the hotel, not in the total. */
export const localCostOfCacheRow = (row) => localCost({ known: row?.taxExcluded, currency: row?.currency });

/**
 * PURE. A live rate as `/hotel-availability/search` returns it. Hotelbeds sends
 * `taxes: { taxes: [{ included, amount, currency, clientAmount, clientCurrency, type }], allIncluded }`
 * on a single rate, and the admin flattens a multi-room combination to a plain array.
 *
 * Only `included === false` is payable locally. The amount is the tax's own (what the desk
 * charges); `clientAmount` only stands in when the tax has no amount of its own. A local tax
 * without any amount (a bare percentage) makes the whole sum unknown: showing the part we could
 * count as "the" local payment would understate it, so nothing is shown.
 */
export function localCostOfRate(rate) {
  const raw = rate?.taxes;
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw) && raw.allIncluded === true) return null;
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw.taxes) ? raw.taxes : []);
  const local = list.filter((t) => t && t.included === false);
  if (!local.length) return null;

  const fallback = ccyOf(rate?.currency) || 'EUR';
  const own = local.map((t) => {
    const amount = num(t.amount);
    if (amount != null) return { amount, currency: ccyOf(t.currency) || ccyOf(t.clientCurrency) || fallback };
    const client = num(t.clientAmount);
    return client != null ? { amount: client, currency: ccyOf(t.clientCurrency) || fallback } : null;
  });
  if (own.some((x) => x == null)) return null;

  // One currency: add them up. Taxes in different currencies cannot be added, unless every one
  // also states its amount in one common client currency.
  const sumIn = (parts) => {
    const currencies = new Set(parts.map((p) => p.currency));
    if (currencies.size !== 1) return undefined;
    return localCost({ known: parts.reduce((s, p) => s + p.amount, 0), currency: [...currencies][0] });
  };
  const same = sumIn(own);
  if (same !== undefined) return same;
  const client = local.map((t) => {
    const amount = num(t.clientAmount);
    const currency = ccyOf(t.clientCurrency);
    return amount != null && currency ? { amount, currency } : null;
  });
  return client.some((x) => x == null) ? null : (sumIn(client) ?? null);
}
