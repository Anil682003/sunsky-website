/**
 * WHAT A PRICE SAYS, AND WHO IT IS DIVIDED BY.
 *
 * Three rules from the master spec live here, and all three are the kind that look obvious in
 * a meeting and get broken in a component at 11pm.
 *
 * 1. THE DIVISOR IS COUNTED TRAVELLERS, NEVER ROOMS (spec 2.4). Five adults in two rooms is
 *    a five-way split, not a two-way one. Dividing by rooms halves the headline price of a
 *    family holiday and we would be advertising a number nobody can book.
 *
 * 2. INFANTS DO NOT COUNT, BUT THEIR COST DOES. A baby is a traveller to the airline and not
 *    a traveller to the per-person maths. So 1300 for two adults plus an infant is 650 p.p.,
 *    not 433: the infant's fare stays inside the total and out of the divisor. Get this the
 *    other way round and the headline undercuts the real price, which is the one direction of
 *    error that ends in a complaint.
 *
 * 3. "FROM X P.P." IS A PRIVILEGE, NOT A FORMAT (spec 2.4). It is allowed only for exactly
 *    two adults in one room with no children and no infants, because that is the only party
 *    where a per-person figure cannot mislead. Every other composition shows the TOTAL as its
 *    main price. A family of five that sees "From 380 p.p." reads it as their holiday price.
 *
 * WHY THIS FILE HAS NO SENTENCES IN IT. The wording is in the locale files under `price.*`
 * and the pages render it through i18next, so the same rule can speak Dutch. Everything here
 * returns a decision plus a number plus the key to render, never a finished string. The
 * screens differ (a card, a matrix cell, the detail page) and the rule must not.
 *
 * COMPARE, SORT, FILTER, LIVE-CHECK AND BOOK ON `total`, NEVER ON THE P.P. FIGURE. The p.p.
 * number is rounded UP per person, so it multiplies back to more than the trip costs. That is
 * fine on a shelf edge and wrong in a basket.
 *
 * Pure: no React, no DOM, no network, no clock.
 */

/* ─────────────────────────── vocabulary ─────────────────────────── */

/**
 * Ages 0 and 1 are infants (spec 3.5): infant on the flight, infant at the hotel. Age 2 is a
 * child and counts. The boundary is inclusive on purpose, so a one-year-old is an infant right
 * up to the day they turn two.
 */
export const INFANT_MAX_AGE = 1;

/**
 * The two products, spelled exactly as the rest of the site already spells them: this is the
 * `transport` value carried in `searchStore` and in the URL, so `product: search.transport`
 * needs no translation layer. Adding a third spelling is how a package silently starts being
 * priced as a hotel stay.
 */
export const PRODUCT = Object.freeze({
  PACKAGE: 'package',
  HOTEL_ONLY: 'hotel_only',
});

/** Anything that is not explicitly Hotel Only is a package, matching `searchStore`. */
export const productOf = (value) => (value === PRODUCT.HOTEL_ONLY ? PRODUCT.HOTEL_ONLY : PRODUCT.PACKAGE);

/** Which shape the main price takes. The amount means something different in each. */
export const MAIN_PRICE = Object.freeze({
  /** A per-person figure. Only ever for 2 adults in 1 room. */
  FROM_PER_PERSON: 'FROM_PER_PERSON',
  /** The whole package price, flights included. */
  TOTAL_TRIP: 'TOTAL_TRIP',
  /** The whole stay price, no flights. */
  TOTAL_STAY: 'TOTAL_STAY',
});

/**
 * WHICH ROUNDING A NUMBER GETS. There is no default and there never should be: a SUNSKY
 * selling price is rounded up to a whole euro, a mandatory local cost keeps its cents
 * (spec 2.3), and the only way to mix them up is to let a caller not say which one they hold.
 * `formatEuros` therefore demands a kind and complains in development when it does not get one.
 */
export const PRICE_KIND = Object.freeze({
  /** Money the customer pays SUNSKY. Whole euros, always rounded UP. */
  SELLING: 'SELLING',
  /** Money paid on site, tourist tax and the like. Exact to the cent: 12.40 stays 12.40. */
  LOCAL: 'LOCAL',
});

const devError = (message) => {
  if (import.meta.env?.DEV) console.error(`[tripPrice] ${message}`);
};

/**
 * A number, or null. Never 0 by accident: `Number(null)`, `Number('')` and `Number([])` are all
 * 0, which is how a missing price becomes a free holiday and a missing age becomes an infant.
 */
const num = (v) => {
  if (v == null || v === '' || typeof v === 'boolean' || typeof v === 'object') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const int = (v, fallback = 0) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/* ─────────────────────────── display rounding (spec 2.3) ─────────────────────────── */

/**
 * A SUNSKY selling price: whole euros, rounded UP. 501.10 becomes 502.
 *
 * Cents are settled first. A total arrives as a sum of floats, so 500 can reach us as
 * 500.00000000001, and a bare Math.ceil would charge an extra euro for a rounding artefact.
 * Rounding to cents first kills the artefact without touching a real 501.10.
 *
 * This is for DISPLAY. The API rounds the package once, or each room stay once (spec 2.3);
 * this function must never be used to re-round a total that arrived already rounded, and never
 * on a sum of amounts that were each rounded up already, or the customer pays for the rounding
 * twice.
 */
export function sellingEuros(amount) {
  const n = num(amount);
  if (n == null) return null;
  return Math.ceil(Math.round(n * 100) / 100);
}

/**
 * A mandatory local cost: the exact amount, to the cent. 12.40 stays 12.40, never 13.
 *
 * SUNSKY does not collect this money and did not set it, so rounding it up would invent a
 * charge. Only our own selling prices are rounded (spec 2.2, 2.3).
 */
export function localEuros(amount) {
  const n = num(amount);
  if (n == null) return null;
  return Math.round(n * 100) / 100;
}

/**
 * The digits to drop into a "€ {{amount}}" string: grouped, and with the decimals its KIND is
 * entitled to. No currency symbol, because the locale strings already carry the euro sign and
 * decide where it sits.
 *
 * `kind` is required. That is the whole guard: there is no way to format money here without
 * declaring whether it is ours (whole euros) or the property's (cents kept).
 */
export function formatEuros(amount, kind, { locale = 'nl-BE' } = {}) {
  const n = num(amount);
  if (n == null) return null;
  if (kind !== PRICE_KIND.SELLING && kind !== PRICE_KIND.LOCAL) {
    devError(`formatEuros needs a PRICE_KIND: SELLING rounds up to whole euros, LOCAL keeps cents. Got ${JSON.stringify(kind)}; falling back to LOCAL so no amount is silently inflated.`);
  }
  const selling = kind === PRICE_KIND.SELLING;
  const value = selling ? sellingEuros(n) : localEuros(n);
  const digits = selling ? 0 : 2;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/* ─────────────────────────── who is travelling ─────────────────────────── */

/** Is this age an infant? An age nobody gave us is NOT an infant; see `countParty`. */
export const isInfantAge = (age) => {
  const n = num(age);
  return n != null && n >= 0 && n <= INFANT_MAX_AGE;
};

const agesList = (childAges) => {
  if (childAges == null || childAges === '') return [];
  const raw = Array.isArray(childAges) ? childAges : String(childAges).split(',');
  // Blanks are kept as null: they are the answer "birthday not given yet", and dropping them
  // would slide the remaining ages onto the wrong children.
  return raw.map((a) => {
    const s = typeof a === 'string' ? a.trim() : a;
    return s === '' || s == null ? null : num(s);
  });
};

/**
 * Read a search party into the four numbers the price rules need.
 *
 * ACCEPTS WHAT THE PAGES ACTUALLY HOLD: counts as numbers or strings, and child ages as the
 * csv the URL carries ("8,1") or an array. `children` is the TOTAL number of children as the
 * search bar counts them, infants included, because that is how the traveller entered them.
 *
 * AN AGE NOBODY GAVE US COUNTS AS A TRAVELLER. A blank age could be a baby, and guessing
 * "infant" would shrink the divisor and print a per-person price below the real one. Guessing
 * "child" only ever overstates the split, which is the safe direction. (The spec wants the
 * real age sent everywhere anyway; see spec 3.5 on `CHILD_AGE_DEFAULT`.)
 *
 * `rooms` is echoed back and is never part of any division. It is here so a reader can see it
 * being ignored.
 *
 * @param {object} party
 * @param {number|string} party.adults
 * @param {number|string} [party.children] total children, infants included
 * @param {string|Array<number|string|null>} [party.childAges] one entry per child; blanks allowed
 * @param {number|string} [party.infants] only consulted when no ages are given
 * @param {number|string} [party.rooms] defaults to 1
 * @returns {{adults:number, children:number, infants:number, travellers:number, counted:number, rooms:number, valid:boolean}}
 *   `children` is the children that COUNT (age 2+, or age unknown); `infants` those that do not;
 *   `counted` is adults + children, the only legal divisor; `valid` is false for a party with
 *   nobody to divide by.
 */
export function countParty(party = {}) {
  const adults = int(party.adults, 0);
  const ages = agesList(party.childAges);
  const statedInfants = int(party.infants, 0);
  const total = Math.max(int(party.children, ages.length), ages.length, statedInfants);

  const infants = ages.length
    ? ages.slice(0, total).filter(isInfantAge).length
    : Math.min(statedInfants, total);

  const children = Math.max(0, total - infants);
  const counted = adults + children;

  return Object.freeze({
    adults,
    children,
    infants,
    travellers: adults + children + infants,
    counted,
    rooms: Math.max(1, int(party.rooms, 1)),
    // Spec 2.4: an infants-only party is not a bookable party. The traveller picker blocks it;
    // this flag is what the pages check so nothing downstream divides by zero.
    valid: counted >= 1,
  });
}

/** Shorthand for the divisor alone: adults + non-infant children. Never rooms. */
export const countedTravellers = (party) => countParty(party).counted;

/* ─────────────────────────── the matrix figure (spec 2.4) ─────────────────────────── */

/**
 * The per-person figure a matrix cell shows: `ceil(rounded total / counted travellers)`.
 *
 * Rounded UP per person, so the parts add up to a little more than the whole. That is
 * deliberate and the reason `mainPrice` also hands back the real `total`: the figure on the
 * shelf edge may never be multiplied back up and charged. 1501 across three travellers is
 * 501 p.p. and the trip still costs 1501, not 1503.
 *
 * The total is passed through `sellingEuros` first, because the spec divides the ROUNDED
 * total. Dividing the raw cents and rounding afterwards drifts by a euro on exactly the
 * amounts a customer is most likely to compare.
 *
 * @returns {number|null} null when there is nobody to divide by or no usable total.
 */
export function perPersonFromTotal(total, party) {
  const rounded = sellingEuros(total);
  if (rounded == null) return null;
  const { counted, valid } = countParty(party);
  if (!valid) {
    devError('perPersonFromTotal was given a party with no counted travellers (infants alone are not a party, spec 2.4). Returning null rather than dividing by zero.');
    return null;
  }
  return Math.ceil(rounded / counted);
}

/* ─────────────────────────── the main price (spec 2.4) ─────────────────────────── */

/**
 * May this party's main price be shown per person?
 *
 * Exactly two adults, exactly one room, no children, no infants. Anything else, including two
 * adults who happen to have booked two rooms, shows a total. The test is written as an
 * equality on every field rather than a set of minimums so that adding a traveller type later
 * cannot quietly widen the exception.
 */
export const allowsFromPerPerson = (party) => {
  const p = countParty(party);
  return p.adults === 2 && p.rooms === 1 && p.children === 0 && p.infants === 0;
};

/**
 * Decide the main price for a card, the hotel detail page or a checkout summary.
 *
 * Returns the DECISION, not a sentence: which variant, the number to print, the i18n key to
 * print it with, and the untouched rounded total to compare, sort, live-check and book on. The
 * pages own the wording, in two languages; this owns the rule.
 *
 * @param {object} args
 * @param {number|string} args.total the SUNSKY payable total for the whole party
 * @param {object} args.party see `countParty`
 * @param {string} [args.product] `PRODUCT.PACKAGE` (default) or `PRODUCT.HOTEL_ONLY`
 * @returns {{variant:string, amount:number, total:number, average:number|null, counted:number,
 *   i18nKey:string, secondaryKey:string|null, party:object}|null}
 *   `amount` is what the main line shows: the p.p. figure for FROM_PER_PERSON, otherwise the
 *   total. `average` is the optional secondary line, and `secondaryKey` is null when the main
 *   line is already per person (repeating it as an "average" would be nonsense). null overall
 *   means there is nothing honest to show: no usable total, or nobody to price for.
 */
export function mainPrice({ total, party, product } = {}) {
  const rounded = sellingEuros(total);
  const p = countParty(party);

  if (rounded == null) return null;
  if (!p.valid) {
    devError('mainPrice was given a party with no counted travellers (infants alone are not a party, spec 2.4). Returning null.');
    return null;
  }

  const average = Math.ceil(rounded / p.counted);

  if (allowsFromPerPerson(party)) {
    return Object.freeze({
      variant: MAIN_PRICE.FROM_PER_PERSON,
      amount: average,
      total: rounded,
      average,
      counted: p.counted,
      i18nKey: 'price.from',
      secondaryKey: null,
      party: p,
    });
  }

  const hotelOnly = productOf(product) === PRODUCT.HOTEL_ONLY;
  return Object.freeze({
    variant: hotelOnly ? MAIN_PRICE.TOTAL_STAY : MAIN_PRICE.TOTAL_TRIP,
    amount: rounded,
    total: rounded,
    average,
    counted: p.counted,
    i18nKey: hotelOnly ? 'price.totalStay' : 'price.totalTrip',
    // Spec 2.4 allows an average per person as a clearly labelled second line. Labelled as an
    // average, never as a "from" price: it is arithmetic, not an offer anyone can book alone.
    secondaryKey: 'price.average',
    party: p,
  });
}
