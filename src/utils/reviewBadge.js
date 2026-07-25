// Turn the normalised review from the availability API into the values the hero badge draws,
// or null when there is nothing worth showing. Kept separate from the JSX so the rounding,
// clamping and label rules are testable without rendering the whole hotel-detail page.
//
// Input shape (from the backend's normaliseReview):
//   { rate: 4.4, count: 756, type: 'TRIPADVISOR', outOf: 5 }
//
// Output:
//   { score: '4.4', fillPct: 88, label: 'TripAdvisor', meta: 'TripAdvisor · 756 reviews',
//     title: '4.4 of 5 on TripAdvisor from 756 reviews' }
//   or null

export function formatReview(review) {
  const rate = Number(review?.rate);
  if (!Number.isFinite(rate) || rate <= 0) return null;   // unrated → no badge, never "0 stars"

  const outOf = Number(review?.outOf) > 0 ? Number(review.outOf) : 5;
  const fillPct = Math.round(Math.max(0, Math.min(1, rate / outOf)) * 100);
  const count = Number(review?.count);
  const hasCount = Number.isFinite(count) && count > 0;

  const label = String(review?.type).toUpperCase() === 'TRIPADVISOR' ? 'TripAdvisor' : 'Guest rating';
  const countText = hasCount ? `${count.toLocaleString('en-GB')} reviews` : '';
  const score = rate.toFixed(1);

  return {
    score,                                               // "4.4"
    fillPct,                                             // 0–100, for the bubble fill width
    label,                                               // "TripAdvisor" | "Guest rating"
    count: hasCount ? count : 0,                         // numeric review count (0 = unknown)
    meta: [label, countText].filter(Boolean).join(' · '),
    title: `${score} of ${outOf} on ${label}${hasCount ? ` from ${countText}` : ''}`,
  };
}

export default formatReview;
