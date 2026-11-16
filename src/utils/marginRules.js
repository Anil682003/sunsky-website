// COPY of sunsky-admin backend/services/margin/marginEngine.rules.js — keep it IDENTICAL.
// The website prices live rooms with the same arithmetic the server re-checks the booking with,
// so a quoted price is never refused at payment. Change it in the admin first, then copy it here.

// =============================================================================
// marginEngine.rules.js — SUNSKY's central Margin Engine, as pure arithmetic.
//
// PURE. No database, no imports, no clock, no config loading. Everything comes in
// as arguments and everything goes out as a return value, so every branch below is
// unit-testable without a database and the same code can price a search result, a
// checkout and an offline booking.
//
// ── what this is ──
// One engine for all seven products, per SUNSKY's "Central Margin Engine" V1
// specification. Each product has its own approved method; none of them is a
// separate engine:
//
//   Flight Only             fixed margin per traveller
//   Hotel Only              supplier-cost tiers + minimum target margin
//   Transfer Only           supplier-cost tiers + minimum target margin
//   Dynamic Package         base + (cost x variable %) + minimum target margin
//   Cancellation Insurance  % of trip selling price before insurance, with a floor
//   Assistance Insurance    travellers x insured days x daily rate
//   Car Rental Only         cost x margin % + minimum target margin
//
// ── why every function returns {ok} instead of a number ──
// This decides what a customer is charged. The dangerous failure is not a crash,
// it is a QUIET ZERO: a missing config or a stray NaN returning 0 sells the trip at
// supplier cost, and nothing anywhere looks broken. So a calculation that cannot be
// performed says so, and the caller decides whether to refuse the sale or fall back.
// Nothing here ever invents a margin.
//
// ── what it deliberately does NOT do ──
// No VAT. SUNSKY has a VAT engine already and the specification says twice not to
// rebuild it: this returns the commercial margin, the VAT engine does the fiscal
// treatment afterwards. No supplier-, airline-, hotel- or destination-specific
// rules, no maximum margin, no margin adjustment, no competitor pricing. All of
// those are named in the spec as explicitly out of scope for V1.
// =============================================================================

/** The seven product sections, as stored and as addressed over the API. */
export const PRODUCTS = Object.freeze({
  FLIGHT_ONLY: 'FLIGHT_ONLY',
  HOTEL_ONLY: 'HOTEL_ONLY',
  TRANSFER_ONLY: 'TRANSFER_ONLY',
  DYNAMIC_PACKAGE: 'DYNAMIC_PACKAGE',
  CANCELLATION_INSURANCE: 'CANCELLATION_INSURANCE',
  ASSISTANCE_INSURANCE: 'ASSISTANCE_INSURANCE',
  CAR_RENTAL_ONLY: 'CAR_RENTAL_ONLY',
});

export const PRODUCT_KEYS = Object.freeze(Object.keys(PRODUCTS));

/** Config key per product, so the menu and the engine cannot drift apart. */
export const CONFIG_KEY = Object.freeze({
  FLIGHT_ONLY: 'flightOnly',
  HOTEL_ONLY: 'hotelOnly',
  TRANSFER_ONLY: 'transferOnly',
  DYNAMIC_PACKAGE: 'dynamicPackage',
  CANCELLATION_INSURANCE: 'cancellationInsurance',
  ASSISTANCE_INSURANCE: 'assistanceInsurance',
  CAR_RENTAL_ONLY: 'carRentalOnly',
});

/* ── money ────────────────────────────────────────────────────────────────────
   Two decimals, half away from zero. `Math.round` alone is half-UP, which biases
   every .005 in one direction and rounds -0.005 to -0.00; over a year of bookings
   that is a real number. The epsilon nudge absorbs binary representation error so
   1.005 rounds to 1.01 rather than 1.00. */
export const round2 = (x) => {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  const s = n < 0 ? -1 : 1;
  return (s * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100;
};

/** A finite number >= 0, or null. Rejects NaN, Infinity, '', null, '12abc', negatives. */
const money = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v.trim()) : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
};

/** A finite integer >= 0, or null. */
const count = (v) => {
  const n = money(v);
  if (n === null || !Number.isInteger(n)) return null;
  return n;
};

/** A percentage: finite, >= 0. Above 100 is allowed (a 150% margin is a choice, not a bug). */
const percent = (v) => money(v);

const fail = (reason, detail) => ({ ok: false, reason, ...(detail ? { detail } : {}) });

/* ── price tiers ──────────────────────────────────────────────────────────────
   A tier is { from, to, percent }. `to: null` (or undefined) means "no upper
   limit", which the spec requires for the final tier. Bounds are INCLUSIVE at both
   ends, matching how the examples are written (€0 – €499.99, then €500 – €999.99):
   the tiers in the document do not overlap because each one stops a cent short of
   the next, so inclusive/inclusive reproduces them exactly.

   Tiers are sorted by `from` before matching rather than trusted in stored order,
   so a row added out of order in the dashboard still behaves. The FIRST tier that
   contains the amount wins, which makes an accidental overlap deterministic rather
   than arbitrary. */
export const normaliseTiers = (tiers) => {
  if (!Array.isArray(tiers)) return null;
  const out = [];
  for (const t of tiers) {
    if (!t || typeof t !== 'object') return null;
    const from = money(t.from);
    const pct = percent(t.percent);
    if (from === null || pct === null) return null;
    const hasTo = t.to !== null && t.to !== undefined && t.to !== '';
    const to = hasTo ? money(t.to) : null;
    if (hasTo && (to === null || to < from)) return null;
    out.push({ from, to, percent: pct });
  }
  return out.sort((a, b) => a.from - b.from);
};

/** The tier containing `amount`, or null when the tiers do not cover it. */
export const findTier = (tiers, amount) => {
  const list = normaliseTiers(tiers);
  const a = money(amount);
  if (list === null || a === null) return null;
  for (const t of list) {
    if (a >= t.from && (t.to === null || a <= t.to)) return t;
  }
  return null;
};

/**
 * cost x tier% , floored at the minimum. Shared by Hotel Only, Transfer Only.
 *
 * A cost that no tier covers is a REFUSAL, not a fall-through to the minimum. An
 * uncovered amount means the tier table has a hole in it, and quietly charging the
 * floor on a €4,000 booking because somebody mistyped an upper bound is exactly the
 * kind of loss nobody notices for months.
 */
const tieredMargin = (cfg, supplierCost, label) => {
  const cost = money(supplierCost);
  if (cost === null) return fail('INVALID_SUPPLIER_COST', { supplierCost });
  if (!cfg || typeof cfg !== 'object') return fail('MISSING_CONFIG', { product: label });

  const tiers = normaliseTiers(cfg.tiers);
  if (tiers === null) return fail('INVALID_TIERS', { product: label });
  if (tiers.length === 0) return fail('NO_TIERS_CONFIGURED', { product: label });

  const min = money(cfg.minMargin ?? 0);
  if (min === null) return fail('INVALID_MIN_MARGIN', { product: label });

  const tier = findTier(tiers, cost);
  if (!tier) return fail('NO_TIER_FOR_COST', { product: label, supplierCost: cost });

  const calculated = round2(cost * (tier.percent / 100));
  const margin = round2(Math.max(calculated, min));
  return {
    ok: true,
    margin,
    basis: margin > calculated ? 'minimum' : 'tier',
    detail: { supplierCost: cost, tier, calculated, minMargin: min },
  };
};

/* ── the seven products ───────────────────────────────────────────────────── */

/**
 * Flight Only: a fixed amount per traveller, once per booking.
 *
 * Not per segment, per leg, per PNR, per airline or per supplier — the spec lists
 * all five, because adding it per segment on a multi-city trip is the easy mistake
 * and it silently multiplies the margin. Callers pass traveller COUNTS for the
 * whole booking, which makes that error impossible to express here.
 */
export function flightOnlyMargin(cfg, { adults, children, infants } = {}) {
  if (!cfg || typeof cfg !== 'object') return fail('MISSING_CONFIG', { product: 'FLIGHT_ONLY' });

  const adt = money(cfg.adt);
  const chd = money(cfg.chd);
  const inf = money(cfg.inf);
  if (adt === null || chd === null || inf === null) return fail('INVALID_CONFIG', { product: 'FLIGHT_ONLY' });

  const nA = count(adults ?? 0);
  const nC = count(children ?? 0);
  const nI = count(infants ?? 0);
  if (nA === null || nC === null || nI === null) return fail('INVALID_TRAVELLER_COUNTS', { adults, children, infants });
  if (nA + nC + nI === 0) return fail('NO_TRAVELLERS');

  const margin = round2(nA * adt + nC * chd + nI * inf);
  return {
    ok: true,
    margin,
    basis: 'perTraveller',
    detail: { adults: nA, children: nC, infants: nI, rates: { adt, chd, inf } },
  };
}

/** Hotel Only: supplier-cost tier %, floored at the minimum, on the booking total. */
export function hotelOnlyMargin(cfg, { supplierCost } = {}) {
  return tieredMargin(cfg, supplierCost, 'HOTEL_ONLY');
}

/**
 * Transfer Only: same method as Hotel Only, its own numbers.
 *
 * STANDALONE transfers only. A transfer inside a Dynamic Package must not come
 * through here; its cost belongs in the package total instead. See
 * dynamicPackageMargin, which takes transferCost for exactly that reason.
 */
export function transferOnlyMargin(cfg, { supplierCost } = {}) {
  return tieredMargin(cfg, supplierCost, 'TRANSFER_ONLY');
}

/**
 * Dynamic Package: one margin for flight + hotel + optional transfer, together.
 *
 * Takes the three component costs rather than a pre-summed total, on purpose. The
 * failure the spec spends a whole section on is the double margin: adding Flight
 * Only, Hotel Only and Transfer Only margins and THEN the package margin. A caller
 * that has to hand over raw component costs has nowhere to put an already-marked-up
 * number, and `assertPackageInputsAreNet` below makes the check explicit.
 *
 * No tiers and no per-traveller element: the spec rules both out by name.
 */
export function dynamicPackageMargin(cfg, { flightCost, hotelCost, transferCost } = {}) {
  if (!cfg || typeof cfg !== 'object') return fail('MISSING_CONFIG', { product: 'DYNAMIC_PACKAGE' });

  const base = money(cfg.baseMargin ?? 0);
  const variable = percent(cfg.variablePercent ?? 0);
  const min = money(cfg.minMargin ?? 0);
  if (base === null || variable === null || min === null) return fail('INVALID_CONFIG', { product: 'DYNAMIC_PACKAGE' });

  const f = money(flightCost);
  const h = money(hotelCost);
  // A package without a transfer is the normal case, not an error.
  const t = transferCost === null || transferCost === undefined ? 0 : money(transferCost);
  if (f === null) return fail('INVALID_FLIGHT_COST', { flightCost });
  if (h === null) return fail('INVALID_HOTEL_COST', { hotelCost });
  if (t === null) return fail('INVALID_TRANSFER_COST', { transferCost });

  const total = round2(f + h + t);
  const calculated = round2(base + total * (variable / 100));
  const margin = round2(Math.max(min, calculated));
  return {
    ok: true,
    margin,
    basis: margin > calculated ? 'minimum' : 'baseVariable',
    detail: {
      flightCost: f,
      hotelCost: h,
      transferCost: t,
      totalSupplierCost: total,
      baseMargin: base,
      variablePercent: variable,
      calculated,
      minMargin: min,
    },
  };
}

/**
 * Cancellation Insurance: a percentage of the trip SELLING price, floored.
 *
 * Selling price, not supplier cost — the spec is explicit, and the difference is
 * the whole margin. "Before insurance" means after the product or package margin
 * has been applied but before any insurance is added, so insurance is never priced
 * on top of other insurance.
 */
export function cancellationInsurancePrice(cfg, { tripSellingPriceBeforeInsurance } = {}) {
  if (!cfg || typeof cfg !== 'object') return fail('MISSING_CONFIG', { product: 'CANCELLATION_INSURANCE' });

  const rate = percent(cfg.ratePercent);
  const min = money(cfg.minSellingPrice ?? 0);
  if (rate === null || min === null) return fail('INVALID_CONFIG', { product: 'CANCELLATION_INSURANCE' });

  const trip = money(tripSellingPriceBeforeInsurance);
  if (trip === null) return fail('INVALID_TRIP_PRICE', { tripSellingPriceBeforeInsurance });

  const calculated = round2(trip * (rate / 100));
  const sellingPrice = round2(Math.max(calculated, min));
  return {
    ok: true,
    sellingPrice,
    basis: sellingPrice > calculated ? 'minimum' : 'percentage',
    detail: { tripSellingPriceBeforeInsurance: trip, ratePercent: rate, calculated, minSellingPrice: min },
  };
}

/* Calendar-day difference, ignoring time of day and time zone.
   Date objects would make this depend on whichever zone the server happens to run
   in: a booking created at 23:00 CEST is already "tomorrow" in UTC, and the insured
   day count would differ between the website and the invoice. Parsing Y-M-D and
   comparing as UTC midnights removes the question entirely. */
const YMD = /^(\d{4})-(\d{2})-(\d{2})/;
const toUtcMidnight = (value) => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  const m = YMD.exec(String(value ?? '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ts = Date.UTC(y, mo - 1, d);
  // Rejects 2026-02-30 and friends, which Date.UTC would silently roll forward.
  const back = new Date(ts);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return ts;
};

const DAY_MS = 86400000;

/**
 * Insured days, both ends counted: 10 July to 17 July is 8 days, not 7 nights.
 *
 * The spec states the formula and the worked example, because "days" being read as
 * "nights" is the standard way this gets built wrong and it undercharges every
 * single policy by one day.
 */
export function insuredDays(startDate, endDate) {
  const a = toUtcMidnight(startDate);
  const b = toUtcMidnight(endDate);
  if (a === null || b === null) return null;
  if (b < a) return null;
  return Math.round((b - a) / DAY_MS) + 1;
}

/**
 * Assistance Insurance: travellers x insured days x daily rate.
 *
 * One rate for everybody. The spec rules out ADT/CHD/INF rates, geographic zones,
 * price tiers, percentage-of-trip and a minimum selling price, all by name.
 */
export function assistanceInsurancePrice(cfg, { travellers, startDate, endDate, days } = {}) {
  if (!cfg || typeof cfg !== 'object') return fail('MISSING_CONFIG', { product: 'ASSISTANCE_INSURANCE' });

  const rate = money(cfg.pricePerPersonPerDay);
  if (rate === null) return fail('INVALID_CONFIG', { product: 'ASSISTANCE_INSURANCE' });

  const pax = count(travellers);
  if (pax === null) return fail('INVALID_TRAVELLER_COUNT', { travellers });
  if (pax === 0) return fail('NO_TRAVELLERS');

  // Dates are the documented input; an explicit day count is accepted so a caller
  // that already computed it (an offline booking, a re-price) cannot drift from it.
  const nDays = days !== undefined && days !== null ? count(days) : insuredDays(startDate, endDate);
  if (nDays === null) return fail('INVALID_TRAVEL_DATES', { startDate, endDate, days });
  if (nDays === 0) return fail('NO_INSURED_DAYS');

  const sellingPrice = round2(pax * nDays * rate);
  return {
    ok: true,
    sellingPrice,
    basis: 'perPersonPerDay',
    detail: { travellers: pax, insuredDays: nDays, pricePerPersonPerDay: rate },
  };
}

/** Car Rental Only: cost x margin %, floored at the minimum, once per booking. */
export function carRentalOnlyMargin(cfg, { supplierCost } = {}) {
  if (!cfg || typeof cfg !== 'object') return fail('MISSING_CONFIG', { product: 'CAR_RENTAL_ONLY' });

  const pct = percent(cfg.marginPercent);
  const min = money(cfg.minMargin ?? 0);
  if (pct === null || min === null) return fail('INVALID_CONFIG', { product: 'CAR_RENTAL_ONLY' });

  const cost = money(supplierCost);
  if (cost === null) return fail('INVALID_SUPPLIER_COST', { supplierCost });

  const calculated = round2(cost * (pct / 100));
  const margin = round2(Math.max(calculated, min));
  return {
    ok: true,
    margin,
    basis: margin > calculated ? 'minimum' : 'percentage',
    detail: { supplierCost: cost, marginPercent: pct, calculated, minMargin: min },
  };
}

/* ── the one entry point ──────────────────────────────────────────────────────
   Section 11 of the spec: the engine picks the method from the product being
   priced. Callers name a product and hand over inputs; they never choose a
   formula, which is what keeps this one engine rather than seven. */

const MARGIN_PRODUCTS = new Set([
  PRODUCTS.FLIGHT_ONLY,
  PRODUCTS.HOTEL_ONLY,
  PRODUCTS.TRANSFER_ONLY,
  PRODUCTS.DYNAMIC_PACKAGE,
  PRODUCTS.CAR_RENTAL_ONLY,
]);

/**
 * Price one product.
 *
 * @param {string} product one of PRODUCTS
 * @param {object} config  the whole margin config (all seven sections)
 * @param {object} input   whatever that product needs
 * @returns {{ok:true, product, margin?, sellingPrice?, basis, detail}|{ok:false, reason, detail?}}
 *
 * A product switched off in the menu is NOT an error and NOT a zero margin: it
 * comes back `ok:false, reason:'PRODUCT_DISABLED'` so the caller keeps whatever
 * pricing it used before the engine existed. That is what lets this ship without
 * moving a single live price on the day it deploys.
 */
export function calculate(product, config, input = {}) {
  if (!PRODUCT_KEYS.includes(product)) return fail('UNKNOWN_PRODUCT', { product });
  if (!config || typeof config !== 'object') return fail('MISSING_CONFIG', { product });

  const section = config[CONFIG_KEY[product]];
  if (!section || typeof section !== 'object') return fail('MISSING_CONFIG', { product });
  if (section.enabled === false) return fail('PRODUCT_DISABLED', { product });

  let result;
  switch (product) {
    case PRODUCTS.FLIGHT_ONLY: result = flightOnlyMargin(section, input); break;
    case PRODUCTS.HOTEL_ONLY: result = hotelOnlyMargin(section, input); break;
    case PRODUCTS.TRANSFER_ONLY: result = transferOnlyMargin(section, input); break;
    case PRODUCTS.DYNAMIC_PACKAGE: result = dynamicPackageMargin(section, input); break;
    case PRODUCTS.CANCELLATION_INSURANCE: result = cancellationInsurancePrice(section, input); break;
    case PRODUCTS.ASSISTANCE_INSURANCE: result = assistanceInsurancePrice(section, input); break;
    case PRODUCTS.CAR_RENTAL_ONLY: result = carRentalOnlyMargin(section, input); break;
    default: return fail('UNKNOWN_PRODUCT', { product });
  }

  if (!result.ok) return { ...result, product };

  // A margin product also reports the selling price, so no caller has to remember
  // whether this particular product returned a margin or a price.
  if (MARGIN_PRODUCTS.has(product)) {
    const cost = totalSupplierCostOf(product, input);
    return {
      ...result,
      product,
      supplierCost: cost,
      sellingPrice: cost === null ? null : round2(cost + result.margin),
    };
  }
  return { ...result, product };
}

/** The cost base a margin product was priced against, or null when it has none. */
function totalSupplierCostOf(product, input) {
  if (product === PRODUCTS.DYNAMIC_PACKAGE) {
    const f = money(input.flightCost);
    const h = money(input.hotelCost);
    const t = input.transferCost === null || input.transferCost === undefined ? 0 : money(input.transferCost);
    if (f === null || h === null || t === null) return null;
    return round2(f + h + t);
  }
  if (product === PRODUCTS.FLIGHT_ONLY) {
    // Flight Only's margin does not depend on cost, but a caller that supplied one
    // gets the selling price for free rather than having to add it up again.
    return input.supplierCost === undefined ? null : money(input.supplierCost);
  }
  return money(input.supplierCost);
}

/**
 * Guard against the double margin the spec devotes section 12 to.
 *
 * Package component costs must be SUPPLIER costs. If a caller has already run a
 * component through Flight Only or Hotel Only and passes the marked-up figure, the
 * package margin is applied on top of a margin and the customer is overcharged,
 * silently and plausibly. There is no way to detect that from the number alone, so
 * this asserts the one thing that is checkable: that the caller states it.
 *
 * @throws {Error} when a caller has not confirmed the costs are net of margin.
 */
export function assertPackageInputsAreNet({ flightCost, hotelCost, transferCost, areSupplierNet }) {
  if (areSupplierNet !== true) {
    throw new Error(
      'DYNAMIC_PACKAGE requires net supplier costs. Pass areSupplierNet: true to confirm no ' +
        'Flight Only, Hotel Only or Transfer Only margin has already been added to these ' +
        'figures, or the package margin is applied on top of a margin.'
    );
  }
  return { flightCost, hotelCost, transferCost };
}

export default {
  PRODUCTS,
  PRODUCT_KEYS,
  CONFIG_KEY,
  round2,
  normaliseTiers,
  findTier,
  insuredDays,
  flightOnlyMargin,
  hotelOnlyMargin,
  transferOnlyMargin,
  dynamicPackageMargin,
  cancellationInsurancePrice,
  assistanceInsurancePrice,
  carRentalOnlyMargin,
  calculate,
  assertPackageInputsAreNet,
};
