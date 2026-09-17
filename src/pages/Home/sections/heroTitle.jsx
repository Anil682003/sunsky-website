import { Fragment } from 'react';

/**
 * Drawing the hero's headline, and deciding which word of it is gold.
 *
 * Lifted out of Hero.jsx so the decision can be tested on its own: getting the
 * wrong word accented is precisely the fault this replaced, and Hero is 1,600
 * lines that reach for the admin API before they render anything.
 */

/** A title's text, with its newlines kept as line breaks. */
export function titleLines(text) {
  return String(text ?? '')
    .split('\n')
    .map((line, i) => (i === 0 ? line : <Fragment key={i}><br />{line}</Fragment>));
}

/**
 * The hero title as the dashboard stores it now: three separate fields, with the
 * middle one set in the gold handwritten script and nothing else.
 *
 * Returns null when all three are empty, so the caller can fall through to the
 * older single-field shape below.
 *
 * Every part is trimmed and the spaces between them are put back here. A title
 * typed as "Vind jouw " / " zon" would otherwise render a double space, and the
 * dashboard cannot show trailing whitespace for anyone to notice.
 */
export function renderHeroTitleParts({ before, highlight, after } = {}, scriptClass) {
  const lead = String(before ?? '').trim();
  const word = String(highlight ?? '').trim();
  const tail = String(after ?? '').trim();
  if (!lead && !word && !tail) return null;
  return (
    <>
      {lead ? titleLines(lead) : null}
      {lead && word ? ' ' : null}
      {word ? <span className={scriptClass}>{word}</span> : null}
      {tail && (lead || word) ? ' ' : null}
      {tail ? titleLines(tail) : null}
    </>
  );
}

/**
 * The older single-field title, kept for whatever has not been split yet.
 *
 * It carried `*asterisks*` around the accented word, and nothing in the
 * dashboard said so, which is how SUNSKY ended up with the gold on the wrong
 * word. With no asterisks at all it falls back to accenting the word "sun" or
 * "zon" wherever it appears, which is what the shipped default relies on.
 */
export function renderHeroTitle(raw, scriptClass) {
  if (!raw) return null;
  const pattern = raw.includes('*') ? /\*([^*]+)\*/g : /\b(sun|zon)\b/i;
  return raw.split(pattern).map((p, i) =>
    i % 2 === 1
      ? <span key={i} className={scriptClass}>{p}</span>
      : titleLines(p)
  );
}
