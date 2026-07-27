// Hotel vs apartment rating — pure helpers (the <RatingMarks> component lives in
// components/RatingMarks so this file stays JSX-free and Fast-Refresh-clean).
//
// Hotelbeds rates hotels in STARS and apartments in KEYS (llaves) — "4LL" is a four-KEY
// apartment, not four stars. The backend sends `rating: { kind: 'star'|'key', value: 1..5 }`.

/** Clamp a rating's value to a whole 0–5. */
export const ratingValue = (rating) => Math.min(5, Math.max(0, Math.round(Number(rating?.value) || 0)));

/** True for a usable key (apartment) rating. */
export const isKeyRating = (rating) => rating?.kind === 'key' && ratingValue(rating) > 0;

/** "4-key apartment" / "5-star hotel" / "" when unrated. */
export function ratingLabel(rating) {
  const v = ratingValue(rating);
  if (!v) return '';
  return rating.kind === 'key' ? `${v}-key apartment` : `${v}-star hotel`;
}
