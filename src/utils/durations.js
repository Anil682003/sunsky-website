// The trip-length bands offered across the site.
//
// ONE SOURCE OF TRUTH. These used to live only in the home page's Hero, so the hotel detail
// page invented its own list and spoke a different language.
//
// UNITS: bands are worded AND valued in DAYS — the unit the traveller picks ("7 days"). A hotel
// stay is counted internally in NIGHTS (checkout = checkin + nights), and **N days = N-1 nights**
// (arrive day 1, leave day N). So "7 days" is a 6-night stay: check-in Sat 20 → check-out Fri 26.
// Convert with stayDaysToNights/stayNightsToDays at the boundary; never store days as nights.
//
// ONE FORMULA DOES NOT FIT BOTH PRODUCTS (master spec 3.4). "days = nights + 1" is the HOTEL
// ONLY rule, and this file used to apply it to packages too:
//
//   HOTEL ONLY  stay days = (check-out − check-in) + 1, nights = check-out − check-in.
//               8 days from 25 Oct is check-out 1 Nov and 7 nights.
//   PACKAGE     travel days run from the OUTBOUND DEPARTURE date to the RETURN DEPARTURE date.
//               The hotel nights come separately from the flight TIMES and are NOT days − 1:
//               check-in is the local arrival date, check-out is the return flight's local
//               departure date, except a departure between 00:00 and 03:59, which checks out
//               the PREVIOUS day (04:00 exactly checks out the same day). A red-eye home is one
//               night fewer than the day count suggests, and quoting it as one more is a room
//               the customer was never sold.
//
// So package hotel nights are NOT derivable here: they need the chosen flight's times, which is
// why the spec computes them in the API and only shows them on the web. Nothing in this file
// invents them. What this file does is refuse to let one function answer both questions: the
// Hotel Only helpers are named `stay*` and the package helpers `package*`, and the old
// unqualified `daysToNights`/`nightsToDays` remain only as aliases of the Hotel Only pair for
// the callers that already import them.

/* KEY vs LABEL: the label is the STORED value — it rides in the search URL and the
   hotel page's Duration filter matches on it — so it stays English and stable. The
   key is what the UI translates through. Never show a label directly. */
export const DURATION_BANDS = [
  { key: 'd2_5',    label: '2-5 days',   days: 4,  minDays: 2,  maxDays: 5 },
  { key: 'd6_10',   label: '6-10 days',  days: 7,  minDays: 6,  maxDays: 10 },
  { key: 'd11_16',  label: '11-16 days', days: 14, minDays: 11, maxDays: 16 },
  { key: 'd17_24',  label: '17-24 days', days: 21, minDays: 17, maxDays: 24 },
  { key: 'd25plus', label: '25-29 days', days: 28, minDays: 25, maxDays: 29 },
];

/**
 * 29 TRAVEL DAYS IS THE CEILING. The top band used to run to 35 and call itself "25+", which
 * offered lengths the product does not sell and wrote them into search URLs. It is 25 to 29.
 *
 * The label is a stored value: it rides in the search URL and the hotel page matches its
 * Duration filter on it, so renaming it orphans every link already out there. Rather than
 * silently dropping those searches into the default week band, the old spelling stays
 * readable as an alias.
 */
const LEGACY_LABELS = { '25+ days': '25-29 days' };

/** The absolute maximum trip length SUNSKY sells, in travel days. Results, matrix, live checks,
 *  URL, API and checkout all stop here (spec 3.4). */
export const MAX_TRAVEL_DAYS = 29;

/**
 * The most nights a HOTEL ONLY stay can hold: 28, because 29 travel days is the ceiling and a
 * stay's last day is a check-out, not a night. A 29-night stay is a 30-day trip and we do not
 * sell one.
 *
 * Derived rather than typed so the two numbers cannot drift apart if the ceiling ever moves.
 * There is no package equivalent: a package's nights come from the flight times (see the header),
 * so its cap is on travel DAYS, not nights.
 */
export const MAX_STAY_NIGHTS = MAX_TRAVEL_DAYS - 1;

/* ─────────────── HOTEL ONLY: days ↔ nights ─────────────── */

/** Nights slept in a HOTEL ONLY stay of N calendar days: N-1 (never below 1). */
export const stayDaysToNights = (days) => Math.max(1, Math.round(Number(days)) - 1);
/** Calendar days a HOTEL ONLY stay of N nights spans: N+1. */
export const stayNightsToDays = (nights) => Math.round(Number(nights)) + 1;

/**
 * @deprecated Unqualified, and therefore the bug this file was fixed for: these are the HOTEL
 * ONLY formulas. A package's nights are not its travel days minus one (see the header). Kept
 * because Hero, Results and the hotel page already import them; new code says which product it
 * means by calling `stayDaysToNights`/`stayNightsToDays` or the `package*` helpers below.
 */
export const daysToNights = stayDaysToNights;
/** @deprecated see `daysToNights`. HOTEL ONLY. */
export const nightsToDays = stayNightsToDays;

/** The band with a given label; falls back to the ~1-week band the home page defaults to. */
export const bandByLabel = (label) => {
  const wanted = LEGACY_LABELS[label] ?? label;
  return DURATION_BANDS.find((d) => d.label === wanted) ?? DURATION_BANDS[1];
};

/**
 * The band a length in DAYS belongs to. Bands are worded in days, so this is the direct match
 * and the one a PACKAGE uses: its travel days are counted from the flight dates, never from a
 * nights figure.
 *
 * A length longer than every band's max still belongs to the last one, and anything shorter than
 * the first band's min belongs to the first, so the Duration field always has a label to show
 * whatever arrives in the URL.
 */
export function bandForTravelDays(days) {
  // The null/empty check must come FIRST: Number(null) and Number('') are both 0.
  if (days == null || days === '') return DURATION_BANDS[1];
  const d = Number(days);
  if (!Number.isFinite(d)) return DURATION_BANDS[1];
  return DURATION_BANDS.find((b) => d >= b.minDays && d <= b.maxDays)
    ?? (d > DURATION_BANDS[DURATION_BANDS.length - 1].maxDays
      ? DURATION_BANDS[DURATION_BANDS.length - 1]
      : DURATION_BANDS[0]);
}

/**
 * The band a concrete HOTEL ONLY stay belongs to, given its NIGHTS count. Matched on the
 * day-equivalent (nights + 1), so a 6-night stay (= 7 days) lands in the "6-10 days" band.
 *
 * HOTEL ONLY only. A package that happens to know its hotel nights must not be banded through
 * here: its travel days are counted from the flight dates and can differ from nights + 1 by a
 * day (see the header). Band a package with `bandForTravelDays`.
 */
export function bandForNights(nights) {
  if (nights == null || nights === '') return DURATION_BANDS[1];
  const n = Number(nights);
  if (!Number.isFinite(n)) return DURATION_BANDS[1];
  return bandForTravelDays(stayNightsToDays(n));
}

/**
 * Every exact DAY length selectable inside a band, for the "pick a precise length" row.
 *
 * The cap is now slack — the widest band (17-24) is eight long — but it stays as the guard on
 * how many checkboxes the sidebar can show before it needs to scroll.
 */
export function daysInBand(band, max = 8) {
  if (!band) return [];
  const out = [];
  for (let d = band.minDays; d <= band.maxDays && out.length < max; d += 1) out.push(d);
  return out;
}

/* ─────────────────────────── counting days on a calendar ─────────────────────────── */

/**
 * Parse an ISO date at LOCAL midnight.
 *
 * `new Date('2026-10-25')` is parsed as UTC, so in Brussels it is 02:00 on the 25th in summer and
 * every arithmetic result formatted back through toISOString() lands a day early. Appending the
 * time forces the local reading: the same trick, and the same reason, as `childDob.js`.
 */
const atLocalMidnight = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(`${value.trim().slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Back to "YYYY-MM-DD" from the LOCAL parts, never via toISOString(). */
const toIsoDate = (d) => {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

/** Whole days between two local midnights. Rounded, so a DST shift cannot drop a day. */
const daysBetween = (from, to) => Math.round((to - from) / 86400000);

const shiftDays = (d, days) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/**
 * HOTEL ONLY nights: check-out minus check-in. 25 Oct to 1 Nov is 7 nights.
 *
 * @returns {number|null} null when either date is unusable, or when check-out is not after
 *   check-in. Zero nights is not a short stay, it is a broken search, and returning 0 would let a
 *   caller price a stay nobody sleeps in.
 */
export function stayNights(checkIn, checkOut) {
  const a = atLocalMidnight(checkIn);
  const b = atLocalMidnight(checkOut);
  if (!a || !b) return null;
  const n = daysBetween(a, b);
  return n >= 1 ? n : null;
}

/**
 * HOTEL ONLY stay days: (check-out minus check-in) + 1. 25 Oct to 1 Nov is 8 days.
 *
 * This is the number the traveller picked in the Duration field, which is why the bands are
 * worded in it. It counts the check-out DAY, on which nobody sleeps.
 */
export function stayDays(checkIn, checkOut) {
  const n = stayNights(checkIn, checkOut);
  return n == null ? null : n + 1;
}

/**
 * The check-out date for a HOTEL ONLY stay of N DAYS: check-in + (days - 1).
 *
 * The spec's own worked example, and the reason it is worth a function: 8 days from 25 Oct is
 * check-out 1 Nov, not 2 Nov. Adding the day count straight onto the check-in is the off-by-one
 * this file exists to prevent.
 *
 * @returns {string|null} ISO date, or null for an unusable check-in or a day count below 2.
 */
export function stayCheckOut(checkIn, days) {
  const start = atLocalMidnight(checkIn);
  const d = Math.round(Number(days));
  if (!start || !Number.isFinite(d) || d < 2) return null;
  return toIsoDate(shiftDays(start, d - 1));
}

/**
 * PACKAGE travel days: outbound departure date to return departure date, inclusive.
 *
 * Both arguments are DEPARTURE dates (spec 3.4), so a trip leaving 25 Oct and flying home on
 * 1 Nov is 8 travel days. It deliberately says nothing about hotel nights: a return flight at
 * 01:30 checks the room out on 31 Oct, so the same 8 travel days can be 6 nights or 7 depending
 * on the flight times, and only the API knows which. Never pass this through `stayDaysToNights`.
 *
 * @returns {number|null} null when either date is unusable or the return precedes the outbound.
 */
export function packageTravelDays(outboundDepartureDate, returnDepartureDate) {
  const out = atLocalMidnight(outboundDepartureDate);
  const back = atLocalMidnight(returnDepartureDate);
  if (!out || !back) return null;
  const diff = daysBetween(out, back);
  return diff >= 0 ? diff + 1 : null;
}

/**
 * The return DEPARTURE date for a package of N travel days: outbound + (days - 1). The mirror of
 * `packageTravelDays`, on the same inclusive count, so a 1-day trip returns the day it leaves.
 *
 * @returns {string|null} ISO date, or null for an unusable outbound or a day count below 1.
 */
export function packageReturnDate(outboundDepartureDate, travelDays) {
  const out = atLocalMidnight(outboundDepartureDate);
  const d = Math.round(Number(travelDays));
  if (!out || !Number.isFinite(d) || d < 1) return null;
  return toIsoDate(shiftDays(out, d - 1));
}

/** Is this length one SUNSKY sells: 1 to 29 travel days (spec 3.4)? */
export const withinTravelDayLimit = (days) => {
  const d = Number(days);
  return Number.isFinite(d) && d >= 1 && d <= MAX_TRAVEL_DAYS;
};

/** Is this a HOTEL ONLY stay we sell: 1 to 28 nights, which is the 29-day ceiling in nights? */
export const withinStayNightLimit = (nights) => {
  const n = Number(nights);
  return Number.isFinite(n) && n >= 1 && n <= MAX_STAY_NIGHTS;
};
