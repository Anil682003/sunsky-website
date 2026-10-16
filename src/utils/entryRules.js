/**
 * Which homepage entry a search came through (Master §12B.2, UI-20).
 *
 * Two of the travel categories change what a search means rather than just narrowing it:
 *
 *   Last Minute   starts with a departure window of today → today + 42 days;
 *   All Inclusive keeps only offers whose own room rate carries an AI-family board.
 *
 * Both are DEFAULTS, not filters: the moment the traveller sets their own dates or picks
 * another meal plan, theirs wins and the entry's is dropped. That decision belongs to the
 * backend, which already applies the entry only in the absence of a customer choice and reports
 * what it did as `entryApplied`. So the website's whole job is to say which door was used and to
 * repeat back what the answer says was applied — never to compute the window itself, which would
 * be a second implementation of a rule that has to agree with the server's to the day.
 *
 * `entryOf` mirrors `backend/utils/entryRules.js` exactly, including the hyphen-to-underscore
 * normalisation, because the slug it reads ("last-minute") and the value the API wants
 * ("last_minute") are not the same string.
 */

export const LAST_MINUTE = 'last_minute';
export const ALL_INCLUSIVE = 'all_inclusive';

/**
 * PURE. The entry a holiday type's slug or name represents, or null for every other type.
 *
 * Deliberately a closed list. A type the dashboard names "Last Minute Deals" is not this entry:
 * silently applying a 42-day window to a search the traveller did not ask to narrow would hide
 * holidays they came to see, so an unrecognised value changes nothing.
 */
export function entryOf(value) {
  const v = String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
  return v === LAST_MINUTE || v === ALL_INCLUSIVE ? v : null;
}

/** Is this an entry whose defaults the server may apply? */
export const isEntry = (value) => entryOf(value) != null;

/**
 * What the answer says was actually applied, in a shape the search summary can read.
 *
 * Returns null when nothing was applied, which is the normal case: the traveller had already
 * chosen dates or a meal plan, so their choice stood and there is nothing to announce.
 *
 * @param entryApplied  the `entryApplied` block from /packages
 * @returns {null | { entry, from?, to?, boards? }}
 */
export function appliedSummary(entryApplied) {
  const entry = entryOf(entryApplied?.entry);
  if (!entry) return null;

  if (entry === LAST_MINUTE) {
    const from = iso(entryApplied?.window?.from);
    const to = iso(entryApplied?.window?.to);
    // A window missing either end is not a window. Announcing "from 16 October to —" tells the
    // traveller a date range is in force without saying what it is.
    return from && to ? { entry, from, to } : null;
  }

  const boards = (Array.isArray(entryApplied?.boards) ? entryApplied.boards : [])
    .map((b) => String(b || '').trim().toUpperCase())
    .filter(Boolean);
  return boards.length ? { entry, boards } : null;
}

const iso = (v) => {
  const s = String(v ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export default entryOf;
