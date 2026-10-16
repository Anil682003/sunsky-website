/**
 * What the count above the results list is entitled to say (UI-08, Ch 1 §2, §5).
 *
 * PURE. The wording lives in the page; this decides whether we may print a number at all, which
 * is the part that is easy to get quietly wrong. Three answers:
 *
 *   searching    the first results are not in yet;
 *   calculating  there IS a number on screen, but it is not the answer to the question being
 *                asked, so it must not be shown;
 *   count        a figure we stand behind, with `approx` when the list is known to be partial.
 *
 * The middle one is the whole point. Two ways a total lies without being wrong:
 *
 *   • Flight + Hotel asks each destination separately and they answer one by one. Until the last
 *     group is in, the running total is the sum of whoever replied first — an exact-looking
 *     number that climbs while the traveller watches it, and that they may well act on.
 *   • After a filter change the number on screen belongs to the previous filters entirely.
 *
 * `approx` is the honest version of a different gap: with Hotel only in price order the cache
 * prices just enough for the page, so the loaded count is a floor, not a total, and it carries
 * a "+" instead of pretending the list is everything.
 */

export const SEARCHING = 'searching';
export const CALCULATING = 'calculating';
export const COUNT = 'count';

/**
 * @param {object} s
 * @param {boolean} s.loading           the first page has not arrived
 * @param {boolean} s.filtering         a filter changed and the new answer is on its way
 * @param {string}  s.transport         'package' (Flight + Hotel) or 'hotel_only'
 * @param {number}  s.pkgLoadingGroups  destination groups still to answer (packages only)
 * @param {number|null} s.shownTotal    the total the API stated; null = it did not state one
 * @param {number}  s.loadedCount       rows on the page right now
 * @param {boolean} s.hasMore           more pages exist
 */
export function countState({
  loading = false,
  filtering = false,
  transport = 'hotel_only',
  pkgLoadingGroups = 0,
  shownTotal = null,
  loadedCount = 0,
  hasMore = false,
} = {}) {
  if (loading) return { kind: SEARCHING, value: null, approx: false };

  // A stated total is a complete answer, so late groups no longer matter: the API has told us
  // the number and the remaining groups only fill in rows.
  const partialPackages = transport === 'package' && pkgLoadingGroups > 0 && shownTotal == null;
  if (filtering || partialPackages) return { kind: CALCULATING, value: null, approx: false };

  return {
    kind: COUNT,
    value: shownTotal ?? loadedCount,
    approx: shownTotal == null && hasMore,
  };
}

export default countState;
