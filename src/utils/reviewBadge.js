// Turn the stored review (from the harvested hotelReviews store, served on the bulk hotel-info
// response) into the values the rating badges draw, or null when there's nothing to show.
// Kept separate from the JSX so the scaling, rounding and label rules are testable without
// rendering a page.
//
// Input shape (from the backend):
//   { rate: 4.4, count: 756, type: 'TRIPADVISOR', outOf: 5 }   // rate is the RAW 1–5 value
//
// We present it on a /10 basis (the business's chosen scale, like Booking.com): 4.4/5 → 8.8/10.
// The raw value stays the source of truth in the DB; only the display scale lives here.
//
// Output:
//   { score: '8.8', outOf: 10, fillPct: 88, label: 'TripAdvisor', count: 756,
//     meta: 'TripAdvisor · 756 reviews', title: '8.8 / 10 on TripAdvisor from 756 reviews' }
//   or null

const DISPLAY_SCALE = 10;   // show ratings out of 10, not the provider's native 5

export function formatReview(review) {
  const rate = Number(review?.rate);
  if (!Number.isFinite(rate) || rate <= 0) return null;   // unrated → no badge, never "0"

  const sourceScale = Number(review?.outOf) > 0 ? Number(review.outOf) : 5;   // TripAdvisor = /5
  const proportion = Math.max(0, Math.min(1, rate / sourceScale));
  // Prefer the STORED 10-point score (the DB is the source of truth per the rating spec); fall
  // back to deriving it (rate × 2) for a live review that hasn't been persisted yet.
  const stored10 = Number(review?.rating10);
  const ten = Number.isFinite(stored10) && stored10 > 0 ? stored10 : proportion * DISPLAY_SCALE;
  const score = ten.toFixed(1);                             // "8.8"
  const fillPct = Math.round((ten / DISPLAY_SCALE) * 100);  // 0–100, for a bar/meter

  const count = Number(review?.count);
  const hasCount = Number.isFinite(count) && count > 0;
  const label = String(review?.type).toUpperCase() === 'TRIPADVISOR' ? 'TripAdvisor' : 'Guest rating';
  const countText = hasCount ? `${count.toLocaleString('en-GB')} reviews` : '';

  return {
    score,                                               // "8.8" (out of 10)
    outOf: DISPLAY_SCALE,                                // 10
    fillPct,                                             // 0–100
    label,                                               // "TripAdvisor" | "Guest rating"
    count: hasCount ? count : 0,                         // numeric review count (0 = unknown)
    meta: [label, countText].filter(Boolean).join(' · '),
    title: `${score} / ${DISPLAY_SCALE} on ${label}${hasCount ? ` from ${countText}` : ''}`,
  };
}

/**
 * Which colour band a score belongs to.
 *
 * The badge used to be gold at every score, so a 6.4 "Pleasant" was presented with exactly the
 * celebration a 9.4 "Excellent" got — the strongest visual signal in the hero, pointing at a
 * middling hotel. Banding keeps gold meaningful: green is earned, amber is honest, and a weak
 * score is stated plainly rather than dressed up.
 *
 * Bands line up with `scoreWord`, so the colour and the word can never disagree.
 *   high — 8.0+  (Excellent / Very good)
 *   mid  — 6.0+  (Good / Pleasant)
 *   low  — under 6 (Fair)
 */
export function scoreBand(score) {
  // Guard empty/null FIRST, exactly as scoreWord does: Number('') and Number(null) are both 0,
  // which is finite — so a missing score would otherwise be banded as the WORST rating rather
  // than as "no opinion".
  if (score == null || score === '') return 'mid';
  const s = Number(score);
  if (!Number.isFinite(s)) return 'mid';
  if (s >= 8) return 'high';
  if (s >= 6) return 'mid';
  return 'low';
}

// A short word for the score, so a card can print "Excellent 8.8" like the reference sites.
export function scoreWord(score) {
  if (score == null || score === '') return '';
  const s = Number(score);
  if (!Number.isFinite(s)) return '';
  if (s >= 9) return 'Excellent';
  if (s >= 8) return 'Very good';
  if (s >= 7) return 'Good';
  if (s >= 6) return 'Pleasant';
  return 'Fair';
}

export default formatReview;
