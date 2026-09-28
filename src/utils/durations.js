// The trip-length bands offered across the site.
//
// ONE SOURCE OF TRUTH. These used to live only in the home page's Hero, so the hotel detail
// page invented its own list and spoke a different language.
//
// UNITS: bands are worded AND valued in DAYS — the unit the traveller picks ("7 days"). A hotel
// stay is counted internally in NIGHTS (checkout = checkin + nights), and **N days = N-1 nights**
// (arrive day 1, leave day N). So "7 days" is a 6-night stay: check-in Sat 20 → check-out Fri 26.
// Convert with daysToNights/nightsToDays at the boundary; never store days as nights.

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

/** The absolute maximum trip length SUNSKY sells, in travel days. */
export const MAX_TRAVEL_DAYS = 29;

/** Nights slept for a stay of N calendar days: N-1 (never below 1). */
export const daysToNights = (days) => Math.max(1, Math.round(Number(days)) - 1);
/** Calendar days a stay of N nights spans: N+1. */
export const nightsToDays = (nights) => Math.round(Number(nights)) + 1;

/** The band with a given label; falls back to the ~1-week band the home page defaults to. */
export const bandByLabel = (label) => {
  const wanted = LEGACY_LABELS[label] ?? label;
  return DURATION_BANDS.find((d) => d.label === wanted) ?? DURATION_BANDS[1];
};

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
 * The cap is now slack — the widest band (17-24) is eight long — but it stays as the guard on
 * how many checkboxes the sidebar can show before it needs to scroll.
 */
export function daysInBand(band, max = 8) {
  if (!band) return [];
  const out = [];
  for (let d = band.minDays; d <= band.maxDays && out.length < max; d += 1) out.push(d);
  return out;
}
