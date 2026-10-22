// The order the destination picker lists countries in.
//
// The agency marks countries "Popular Destination" in the dashboard (GeoData → Countries) and
// gives them a rank, so the places that actually sell lead instead of whatever the alphabet
// put first. The API already returns them in this order; this re-sorts on arrival anyway, for
// two reasons: the picker can then show WHERE the popular block ends without counting on the
// server's order being intact, and a cached or re-filtered list cannot quietly lose it.
//
// ORDER ONLY, the same contract the popular departure airports carry: it changes nothing about
// which countries a search covers, and no price, count or availability depends on it.

/** PURE. A rank as the dashboard means it: a whole number from 1 up, else null (unranked). */
export const rankOf = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : null;
};

/** PURE. Is this row one the dashboard marked popular? */
export const isPopularCountry = (c) => !!(c && c.popular);

/**
 * PURE. Popular first, by rank; the unranked after the ranked rather than ahead of them;
 * everyone else by name. Mirrors byPopularThenRank in the admin's utils/destinationFlags.js,
 * which is what orders the API response, so the two agree about what "first" means.
 *
 * Tolerates null/undefined entries: a comparator that throws takes the whole picker with it.
 */
export const byPopularThenName = (x, y) => {
  const a = x || {};
  const b = y || {};
  const pa = isPopularCountry(a) ? 1 : 0;
  const pb = isPopularCountry(b) ? 1 : 0;
  if (pa !== pb) return pb - pa;
  if (pa === 1) {
    const ra = rankOf(a.popularOrder);
    const rb = rankOf(b.popularOrder);
    if (ra !== rb) {
      if (ra === null) return 1;
      if (rb === null) return -1;
      return ra - rb;
    }
  }
  return String(a.name || '').localeCompare(String(b.name || ''));
};

/**
 * PURE. The rail's list, plus how many rows at the top are the popular ones.
 *
 * `popularCount` is what lets the rail draw a divider under the block. It is 0 when nothing is
 * marked popular AND when everything is: a heading over the whole list labels nothing, which is
 * the same rule the departure-airport picker follows.
 *
 * @returns {{ list: object[], popularCount: number }}
 */
export function orderCountries(countries) {
  const list = (Array.isArray(countries) ? countries.filter(Boolean) : []).slice().sort(byPopularThenName);
  const popular = list.filter(isPopularCountry).length;
  return { list, popularCount: popular > 0 && popular < list.length ? popular : 0 };
}

export default orderCountries;
