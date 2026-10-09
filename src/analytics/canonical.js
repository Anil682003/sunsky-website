/**
 * Canonical values for the marketing layer.
 *
 * PURE. No DOM, no React, no network - so the mapping rules are unit-testable on their own,
 * which matters because a quiet change here corrupts months of GA4 history rather than
 * throwing an error anyone would notice.
 *
 * Tracking Master §6 (data standards), §7 (canonical values), §18 (never invent data).
 *
 * THE RULE THAT GOVERNS THIS WHOLE FILE: when a value is not known, return null and let the
 * caller omit the key. §18 is explicit - no empty strings, no "N/A", no "NONE", no guesses.
 * Every function here returns either a correct canonical value or null.
 */

/** Tracking Master §4. The only three product types that may ever be sent. */
export const PRODUCT_TYPES = Object.freeze({
  FLIGHT_HOTEL: 'FLIGHT_HOTEL',
  HOTEL_ONLY: 'HOTEL_ONLY',
  FLIGHT_ONLY: 'FLIGHT_ONLY',
});

/**
 * Which SUNSKY product the traveller is looking at.
 *
 * `kind` is the checkout hand-off's own discriminator ('flight' | 'transfer' | undefined) and
 * `transport` is the search's ('package' | 'hotel_only').
 *
 * TRANSFERS RETURN NULL ON PURPOSE. A transfer is a real SUNSKY product but it is not one of
 * the three canonical types in §4, and §4 forbids inventing an alternative name. Rather than
 * mislabel a transfer as HOTEL_ONLY and pollute the product dimension, nothing is tracked for
 * it until SUNSKY says which type it belongs to. See TRACKING-NOTES.md, open question 3.
 */
export function productType({ kind, transport } = {}) {
  if (kind === 'flight') return PRODUCT_TYPES.FLIGHT_ONLY;
  if (kind === 'transfer') return null;
  if (transport === 'hotel_only') return PRODUCT_TYPES.HOTEL_ONLY;
  if (transport === 'package') return PRODUCT_TYPES.FLIGHT_HOTEL;
  return null;
}

/**
 * Hotelbeds board code -> the five canonical board families in Tracking Master §7.
 *
 * §7: "If SUNSKY already maintains canonical board codes, developers must use or consistently
 * map those existing codes. Do not create a second independent marketing board-type system."
 *
 * SUNSKY does maintain them: BOARD_LABELS in Results.jsx is Hotelbeds' official board
 * dictionary. This collapses that dictionary onto the five families the spec names. It is a
 * mapping of the existing codes, not a second system.
 *
 * The breakfast variants (continental, American, buffet, English, Irish, Scottish, light,
 * two-guest) are all BED_BREAKFAST: the distinction is a hotel's description of the same meal.
 * CE (dinner included), CO (lunch included) and DO (dinner & B&B) sit with HALF_BOARD as the
 * nearest family - one main meal beyond the room. Flagged for SUNSKY in TRACKING-NOTES.md,
 * open question 4, because board taxonomy shapes their reporting.
 */
const BOARD_FAMILY = Object.freeze({
  RO: 'ROOM_ONLY', SC: 'ROOM_ONLY',

  BB: 'BED_BREAKFAST', CB: 'BED_BREAKFAST', AB: 'BED_BREAKFAST', DB: 'BED_BREAKFAST',
  GB: 'BED_BREAKFAST', IB: 'BED_BREAKFAST', SB: 'BED_BREAKFAST', LB: 'BED_BREAKFAST',
  B2: 'BED_BREAKFAST',

  HB: 'HALF_BOARD', MB: 'HALF_BOARD', CE: 'HALF_BOARD', CO: 'HALF_BOARD', DO: 'HALF_BOARD',

  FB: 'FULL_BOARD', PB: 'FULL_BOARD',

  AI: 'ALL_INCLUSIVE', AS: 'ALL_INCLUSIVE', TL: 'ALL_INCLUSIVE', UAI: 'ALL_INCLUSIVE',
  TI: 'ALL_INCLUSIVE',
});

/** Last resort for a hand-off that carries only a printed board label and no code. */
const BOARD_BY_TEXT = [
  [/ultra\s*all\s*inclusive|all\s*inclusive/i, 'ALL_INCLUSIVE'],
  [/full\s*board/i, 'FULL_BOARD'],
  [/half\s*board/i, 'HALF_BOARD'],
  [/breakfast/i, 'BED_BREAKFAST'],
  [/room\s*only|self.?cater/i, 'ROOM_ONLY'],
];

/**
 * @param {string} raw a Hotelbeds board code ("AI") or a printed label ("All inclusive")
 * @returns {string|null} one of the five canonical families, or null when unknown
 */
export function boardType(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  const byCode = BOARD_FAMILY[s.toUpperCase()];
  if (byCode) return byCode;

  for (const [re, family] of BOARD_BY_TEXT) if (re.test(s)) return family;
  // An unmapped code is not guessed at. Omitting the dimension loses one field; guessing it
  // corrupts the dimension for every booking that shares the code.
  return null;
}

/**
 * Tracking Master §6: dates are YYYY-MM-DD.
 *
 * Formatted from the LOCAL calendar parts, never `toISOString()`. A check-in of 15 June held
 * as a local midnight Date becomes "2026-06-14" through UTC in any negative-offset timezone,
 * which silently shifts the departure date of every booking by a day.
 */
export function isoDate(value) {
  if (value == null || value === '') return null;

  if (typeof value === 'string') {
    const s = value.trim();
    // Already canonical (optionally with a time part we do not want).
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Tracking Master §6: IATA, uppercase. Anything that is not three letters is not an airport. */
export function airport(code) {
  const s = String(code ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(s) ? s : null;
}

/**
 * Tracking Master §6: monetary values are numbers, never "EUR 1847" or "1.847,00".
 *
 * Rounded to cents so a floating-point total never reaches GA4 as 1846.9999999999998.
 * Zero is a legitimate amount and survives; a negative or non-finite one does not.
 */
export function money(value) {
  // THE NULL AND EMPTY-STRING CHECKS COME FIRST AND ARE NOT OPTIONAL. `Number(null)` and
  // `Number('')` are both 0, which is finite and not negative - so a booking whose total
  // failed to resolve would otherwise sail through as a free conversion and be reported to
  // Google Ads as €0 revenue. `utils/roomBoards.js` carries the same guard for the same
  // reason, where the consequence was offering a room at €0.
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** A whole, positive count (travellers, nights, duration), or null. */
export function count(value, { min = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i >= min ? i : null;
}

/** A non-empty trimmed string, or null. Used for names and places. */
export function text(value) {
  const s = String(value ?? '').trim();
  return s === '' ? null : s;
}

/**
 * Tracking Master §10: "hotel_id must use SUNSKY's canonical hotel identifier. Where the
 * mapped Hotelbeds hotel code is SUNSKY's canonical hotel identifier, that code must be used."
 *
 * It is. Sent as a string so GA4 never reports the same hotel under both 12345 and "12345".
 */
export function hotelId(code) {
  const s = String(code ?? '').trim();
  return /^\d+$/.test(s) ? s : (s || null);
}

/**
 * Drop every key whose value is null, undefined or an empty string.
 *
 * This is Tracking Master §18 enforced in one place rather than at thirty call sites:
 * "If a field does not apply, omit it." Recurses into plain objects and arrays so an
 * `ecommerce.items[0]` is cleaned on the same rule as the top level. `0` and `false` are
 * real values and are kept.
 */
export function compact(value) {
  if (Array.isArray(value)) {
    return value.map(compact).filter((v) => v !== undefined);
  }
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === undefined || v === '') continue;
      const cleaned = compact(v);
      // An object that emptied out carries no information either.
      if (cleaned && typeof cleaned === 'object' && !Array.isArray(cleaned)
        && Object.keys(cleaned).length === 0) continue;
      out[k] = cleaned;
    }
    return out;
  }
  return value;
}
