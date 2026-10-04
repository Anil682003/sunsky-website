// The query of the admin's /hotel-filters/facets call, in one place: api/filters.js fetchFacets
// sends it, and the "Show all" warmer (scripts/warm-show-all.mjs) asks the same question to learn
// which destinations a search prices. Plain function, no browser, so both can use it.
//
// codes / attrs / counts: false asks for less (see fetchFacets).
export function facetsParams({ countries = [], destinations = [], zones = [] } = {}, filters = {}, opts = {}) {
  const { codes = true, attrs = true, counts = true } = opts;
  const params = {};
  if (countries.length)    params.countries = countries.join(',');
  if (destinations.length) params.destinations = destinations.join(',');
  if (zones.length)        params.zones = zones.join(',');
  const join = (a) => (a && a.length ? a.join(',') : undefined);
  if (join(filters.themes))        params.themes        = join(filters.themes);
  if (join(filters.stars))         params.stars         = join(filters.stars);
  if (join(filters.facilities))    params.facilities    = join(filters.facilities);
  // `activities` entries are either a bare code (620) or a group-qualified "74:620" string, and
  // they go over the wire VERBATIM. Coercing to Number would drop the group and silently widen
  // "Spa centre" to every group that reuses code 620 (73 Waterpark), which is the over-matching
  // the qualified form exists to stop.
  if (join(filters.activities))    params.activities    = join(filters.activities);
  if (join(filters.accommodation)) params.accommodation = join(filters.accommodation);
  if (join(filters.kids))          params.kids          = join(filters.kids);
  if (filters.maxBeach)            params.maxBeach      = String(filters.maxBeach);
  if (filters.maxCentre)           params.maxCentre     = String(filters.maxCentre);
  if (filters.adultsOnly)          params.adultsOnly    = '1';
  // Minimum guest rating on the 10-point scale. Sent only when there IS a bound: '' and 0 both
  // mean "no preference", and either would otherwise travel as a filter the traveller never set.
  if (filters.minRating)           params.minRating     = String(filters.minRating);
  if (!codes) params.codes = '0';
  if (!attrs) params.attrs = '0';
  if (!counts) params.counts = '0';
  return params;
}
