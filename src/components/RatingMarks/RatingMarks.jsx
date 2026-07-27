import { ratingValue } from '../../utils/rating';

// Draws a hotel's rating marks — ★ for hotels, 🔑 for apartments. Hotelbeds rates apartments in
// keys (llaves), not stars. Drop-in for a `{'★'.repeat(n)}`: a star rating renders exactly that
// string; a key rating renders N key glyphs that inherit the surrounding gold colour. Renders
// nothing when unrated.

/** A single key glyph (inherits `currentColor`). */
export const KeyMark = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
       style={{ display: 'inline-block', verticalAlign: '-0.12em' }}>
    <path d="M7 14a5 5 0 1 1 4.9-6h8.1a1 1 0 0 1 .7.3l1.6 1.6a1 1 0 0 1 0 1.4l-2.3 2.3a1 1 0 0 1-1.4 0l-.8-.8-1 1-.9-.9-1 1-1.3-1.3H11.9A5 5 0 0 1 7 14Zm-1.6-3.4a1.4 1.4 0 1 0 0-2 1.4 1.4 0 0 0 0 2Z" />
  </svg>
);

export default function RatingMarks({ rating, keySize = 14 }) {
  const v = ratingValue(rating);
  if (!v) return null;
  if (rating.kind === 'key') {
    return <>{Array.from({ length: v }).map((_, i) => <KeyMark key={i} size={keySize} />)}</>;
  }
  return <>{'★'.repeat(v)}</>;
}
