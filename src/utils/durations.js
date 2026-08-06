// The trip-length bands offered across the site.
//
// ONE SOURCE OF TRUTH. These used to live only in the home page's Hero, so the hotel detail
// page invented its own list and spoke a different language.
//
// UNITS: bands are worded AND valued in DAYS — the unit the traveller picks ("7 days"). A hotel
// stay is counted internally in NIGHTS (checkout = checkin + nights), and **N days = N-1 nights**
// (arrive day 1, leave day N). So "7 days" is a 6-night stay: check-in Sat 20 → check-out Fri 26.
// Convert with daysToNights/nightsToDays at the boundary; never store days as nights.

export const DURATION_BANDS = [
  { label: '2-5 days',   days: 4,  minDays: 2,  maxDays: 5 },
  { label: '6-10 days',  days: 7,  minDays: 6,  maxDays: 10 },
  { label: '11-16 days', days: 14, minDays: 11, maxDays: 16 },
  { label: '17-24 days', days: 21, minDays: 17, maxDays: 24 },
  { label: '25+ days',   days: 28, minDays: 25, maxDays: 35 },
];

/** Nights slept for a stay of N calendar days: N-1 (never below 1). */
export const daysToNights = (days) => Math.max(1, Math.round(Number(days)) - 1);
/** Calendar days a stay of N nights spans: N+1. */
export const nightsToDays = (nights) => Math.round(Number(nights)) + 1;

/** The band with a given label; falls back to the ~1-week band the home page defaults to. */
export const bandByLabel = (label) =>
  DURATION_BANDS.find((d) => d.label === label) ?? DURATION_BANDS[1];

/**
 * The band a concrete stay belongs to, given its NIGHTS count. Matched on the day-equivalent
 * (nights + 1), so a 6-night stay (= 7 days) lands in the "6-10 days" band.
 *
 * A stay longer than every band's max still belongs to the last one ("25+"), and anything
 * shorter than the first band's min belongs to the first — so the Duration field always has a
 * label to show, whatever arrives in the URL.
 */
export function bandForNights(nights) {
  // The null/empty check must come FIRST: Number(null) and Number('') are both 0.
  if (nights == null || nights === '') return DURATION_BANDS[1];
  const n = Number(nights);
  if (!Number.isFinite(n)) return DURATION_BANDS[1];
  const days = nightsToDays(n);
  return DURATION_BANDS.find((b) => days >= b.minDays && days <= b.maxDays)
    ?? (days > DURATION_BANDS[DURATION_BANDS.length - 1].maxDays
      ? DURATION_BANDS[DURATION_BANDS.length - 1]
      : DURATION_BANDS[0]);
}

/**
 * Every exact DAY length selectable inside a band, for the "pick a precise length" row.
 *
 * Capped so the open-ended top band ("25+") offers a usable row rather than eleven buttons.
 */
export function daysInBand(band, max = 8) {
  if (!band) return [];
  const out = [];
  for (let d = band.minDays; d <= band.maxDays && out.length < max; d += 1) out.push(d);
  return out;
}
