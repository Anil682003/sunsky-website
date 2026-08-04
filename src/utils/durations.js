// The trip-length bands offered across the site.
//
// ONE SOURCE OF TRUTH. These used to live only in the home page's Hero, so the hotel detail
// page invented its own list and spoke a different language: home offered "6-10 days" while
// detail offered "7 nights · 8 days". A traveller who picked "6-10 days" on the home page then
// saw "7 nights" on the detail page and had no way to tell whether their search had survived.
//
// NAMING, DELIBERATELY KEPT: a band labelled "6-10 days" carries minNights 6 → 10. The label
// says days, the value counts nights. That is the home page's long-standing convention and the
// URL contract (`minNights`/`maxNights`) the results page already reads, so re-basing it would
// shift every existing search link by a day. Presentation is unified here; the semantics are
// left exactly as they were. Worth correcting deliberately one day — not as a side effect.

export const DURATION_BANDS = [
  { label: '2-5 days',   nights: 4,  minNights: 2,  maxNights: 5 },
  { label: '6-10 days',  nights: 7,  minNights: 6,  maxNights: 10 },
  { label: '11-16 days', nights: 14, minNights: 11, maxNights: 16 },
  { label: '17-24 days', nights: 21, minNights: 17, maxNights: 24 },
  { label: '25+ days',   nights: 28, minNights: 25, maxNights: 35 },
];

/** The band with a given label; falls back to the ~1-week band the home page defaults to. */
export const bandByLabel = (label) =>
  DURATION_BANDS.find((d) => d.label === label) ?? DURATION_BANDS[1];

/**
 * The band a concrete stay length belongs to.
 *
 * A stay longer than every band's max still belongs to the last one ("25+"), and anything
 * shorter than the first band's min belongs to the first — so the Duration field always has a
 * label to show, whatever arrives in the URL.
 */
export function bandForNights(nights) {
  // The null/empty check must come FIRST: Number(null) and Number('') are both 0, which is
  // finite, so a missing value would otherwise sail through as "0 nights" and be filed under
  // the shortest band instead of falling back to the default week.
  if (nights == null || nights === '') return DURATION_BANDS[1];
  const n = Number(nights);
  if (!Number.isFinite(n)) return DURATION_BANDS[1];
  return DURATION_BANDS.find((b) => n >= b.minNights && n <= b.maxNights)
    ?? (n > DURATION_BANDS[DURATION_BANDS.length - 1].maxNights
      ? DURATION_BANDS[DURATION_BANDS.length - 1]
      : DURATION_BANDS[0]);
}

/**
 * Every exact length selectable inside a band, for the "pick a precise length" row.
 *
 * Capped so the open-ended top band ("25+") offers a usable row rather than eleven buttons.
 */
export function lengthsInBand(band, max = 8) {
  if (!band) return [];
  const out = [];
  for (let n = band.minNights; n <= band.maxNights && out.length < max; n += 1) out.push(n);
  return out;
}
