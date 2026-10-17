// "Incl. flight" results from the admin's package search (POST /flight-availability/packages).
//
// With Flight + Hotel only complete packages are listed (Levent, 6 Oct 2026): a hotel appears only
// with a valid outbound + return flight combination and an available stay, and its price, dates,
// nights, departure airport and flights all come from that one package. A destination the cache
// cannot calculate yet (no return fares) is named as such, never treated as "no flights".
//
// Speed (measured on prod, 7 Oct 2026): a precalculated search answers in milliseconds, a cold
// destination in 0.2–7 s, a cold country in minutes. So:
//   - a search without dates of its own (a homepage link) asks exactly the precalculated search:
//     every departure airport, the next 30 days, 7 nights — a cache read;
//   - a dated search is sent per group of destinations, all at once, and the list fills in as
//     each group answers, instead of waiting for the slowest destination of a country.
// Pure helpers; Results.jsx does the requests.

/** Destinations per request: small enough that the first hotels show quickly. */
export const DEST_CHUNK = 4;
/** Groups asked at the same time (each runs its destinations on the admin, 2 at a time). */
export const PACKAGE_CONCURRENCY = 4;
/** Packages asked per group per page. */
export const PACKAGE_PAGE = 100;
/** The precalculated default (admin PACKAGE_PRECALC_NIGHTS). */
export const PRECALC_NIGHTS = '7';

/** /packages accepts at most this many days in one departure window. */
export const PACKAGE_WINDOW_DAYS = 31;

export const isoAddDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const nightsOf = (ci, co) => {
  const n = Math.round((Date.parse(`${co}T00:00:00Z`) - Date.parse(`${ci}T00:00:00Z`)) / 86400000);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** PURE. Split destinations into request groups. */
export function chunkDestinations(destinations, size = DEST_CHUNK) {
  const out = [];
  for (let i = 0; i < destinations.length; i += size) out.push(destinations.slice(i, i + size));
  return out;
}

/**
 * PURE. The package search body for the page's committed search and filters.
 *
 * @param {object} p
 *   fp        committed params (checkIn, checkOut, adults, children, rooms, childAges)
 *   childAges ages fallback (string)
 *   filters   applied filters (boards, refundable, minPrice, maxPrice, priceBasis,
 *             sortBy, nonstop, origins, arrivals)
 *   origins   departure airports chosen ([] = No preference: all of them)
 *   hotelCodes the content filter's codes, or null
 *   dated     false: the search has no dates of its own → the precalculated default
 *   flex      ± days around the departure date (0–3)
 *   bandNights the duration category's lengths in nights: an undated search whose category does
 *             not include 7 nights asks those lengths (computed, not precalculated)
 *   seed      the session's result_random_seed: the default order ('recommended') is the stable
 *             random order (Ch 1 §2); without a seed it falls back to price order
 */
export function packageBody({ fp, childAges = '', filters = {}, origins = [], hotelCodes = null, dated = true, flex = 0, bandNights = null, seed = null, entry = null, startWindow = null }) {
  const body = {
    adults: String(fp.adults ?? '2'),
    children: String(fp.children ?? '0'),
    rooms: String(fp.rooms ?? '1'),
    pageSize: PACKAGE_PAGE,
  };
  const ages = fp.childAges || childAges;
  if (ages) body.childAges = ages;
  // UI-21 (Ch1 §12B.3): a homepage card can carry its own departure window, and it is the
  // traveller's starting point rather than a date they chose, so an explicit date beats it.
  // The window constrains the travel START only; the return may fall after `to`.
  //
  // /packages takes at most 31 days, so a longer range is clipped here rather than silently
  // rejected by the server. Clipping to the FIRST 31 days keeps the soonest departures, which
  // is what someone who clicked "June to August" is most likely to want to see first.
  if (dated && !fp.checkIn && startWindow?.from && startWindow?.to) {
    const limit = isoAddDays(startWindow.from, PACKAGE_WINDOW_DAYS - 1);
    body.from = startWindow.from;
    body.to = startWindow.to > limit ? limit : startWindow.to;
  } else if (dated && fp.checkIn) {
    body.from = flex > 0 ? isoAddDays(fp.checkIn, -flex) : fp.checkIn;
    body.to = flex > 0 ? isoAddDays(fp.checkIn, flex) : fp.checkIn;
    // The trip length in days (N nights = N + 1 days); the flights decide the exact stay.
    const n = nightsOf(fp.checkIn, fp.checkOut);
    if (n) body.travelDays = String(n + 1);
  } else if (Array.isArray(bandNights) && bandNights.length) {
    body.nights = bandNights.includes(Number(PRECALC_NIGHTS)) ? PRECALC_NIGHTS : bandNights.join(',');
  }
  // No date and no length: no `nights` at all. The admin then answers from its nightly 12-month
  // search — every departure date through 12 months and every trip length, cheapest complete
  // package per hotel (Ch 1 §8A, Phase C) — and falls back to the 30-day 7-night default itself.
  if (origins.length) body.origins = origins.join(',');
  if (filters.arrivals?.length) body.arrivals = filters.arrivals.join(',');
  if (filters.nonstop) body.routing = 'nonstop';
  if (Array.isArray(hotelCodes)) body.hotelCodes = hotelCodes;
  if (filters.boards?.length) body.boards = filters.boards;
  if (filters.refundable && filters.refundable !== 'any') body.refundable = filters.refundable;
  const min = filters.minPrice === '' || filters.minPrice == null ? null : Number(filters.minPrice);
  const max = filters.maxPrice === '' || filters.maxPrice == null ? null : Number(filters.maxPrice);
  if (Number.isFinite(min) && min > 0) body.minPrice = min;
  if (Number.isFinite(max) && max > 0 && !(min != null && max < min)) body.maxPrice = max;
  if (filters.priceBasis && filters.priceBasis !== 'total') body.priceBasis = filters.priceBasis;
  // The homepage door this search came through (§12B.2, UI-20). The SERVER decides whether its
  // default still applies — it does not, once the traveller has set dates or a meal plan — and
  // reports back as `entryApplied`. Computing that here would be a second implementation of a
  // rule that has to agree with the server's to the day.
  if (entry) body.entry = entry;
  if (filters.sortBy === 'price_desc') body.sortBy = 'price_desc';
  else if (filters.sortBy === 'recommended' && seed) { body.sortBy = 'random'; body.resultRandomSeed = seed; }
  return body;
}

/** PURE. A package hotel as a results card reads it (the hotel-only card fields + `pkg`). */
export function mapPackage(p, label) {
  return {
    id: p.hotelCode,
    hotelCode: p.hotelCode,
    name: null,                         // from the hotel info record, never the code
    stars: null,
    boardCode: p.board || '',
    roomType: p.room || null,
    totalAmount: p.sunskyPayableTotalRounded ?? Math.ceil(p.sunskyPayableTotal),
    totalAmountUnrounded: p.sunskyPayableTotal,
    perPerson: p.pricePerPerson,
    currency: p.currency || 'EUR',
    nightlyBreakdown: [],
    badge: null,
    img: null,
    loc: label,
    destinationCode: p.destination,
    // No automatic from-price for this hotel (UI-10, Ch 1 §10): the only complete packages it
    // has are shorter than the commercial minimum — 3 travel days for a city trip, 5 otherwise —
    // so quoting one would advertise a weekend break as the price of a holiday. The hotel still
    // belongs in the list; the card offers its available dates instead of a figure.
    noFromPrice: p?.fromPriceEligible === false,
    minTravelDays: Number(p?.commercialMinDays) || null,
    pkg: p,
  };
}

/**
 * PURE. The random order (Ch 1 §2) as the server sorts one answer: hotels without an automatic
 * from-price last, then `randomRank`, then the hotel code. Only when both carry a rank (an admin
 * without the random order answers in price order, and the page keeps that order).
 */
const ranked = (p) => Number.isFinite(p?.randomRank);
const unpricedOf = (p) => (p?.fromPriceEligible === false ? 1 : 0);
const byCode = (a, b) => (String(a.hotelCode) < String(b.hotelCode) ? -1 : String(a.hotelCode) > String(b.hotelCode) ? 1 : 0);
export function randomOrder(a, b) {
  return unpricedOf(a) - unpricedOf(b) || a.randomRank - b.randomRank || byCode(a, b);
}
const isRandom = (sortBy, list) => sortBy === 'recommended' && list.length > 0 && list.every(ranked);

/** PURE. Merge the groups' sorted packages into one sorted list (cheapest first, dearest, or the random order). */
export function mergePackages(groups, sortBy = 'price_asc') {
  const dir = sortBy === 'price_desc' ? -1 : 1;
  const seen = new Set();
  const all = [];
  for (const g of groups) for (const p of g.hotels || []) {
    if (seen.has(p.hotelCode)) continue;
    seen.add(p.hotelCode);
    all.push(p);
  }
  if (isRandom(sortBy, all)) return all.sort(randomOrder);
  return all.sort((a, b) => dir * (a.sunskyPayableTotal - b.sunskyPayableTotal) || (String(a.hotelCode) < String(b.hotelCode) ? -1 : 1));
}

/**
 * PURE. Whether the first `shown` merged packages are final: no group that still has more pages
 * could hold a package that sorts before the last one shown. Then more groups' pages are needed
 * before "Show more" can show more in the right order.
 */
export function groupsToExtend(groups, merged, shown, sortBy = 'price_asc') {
  const cutoff = merged[Math.min(shown, merged.length) - 1];
  const random = isRandom(sortBy, merged);
  return groups.filter((g) => {
    if (!g.hasMore) return false;
    const last = g.hotels?.[g.hotels.length - 1];
    if (!last || !cutoff) return true;
    if (random && ranked(last)) return randomOrder(last, cutoff) <= 0;
    return sortBy === 'price_desc' ? last.sunskyPayableTotal >= cutoff.sunskyPayableTotal : last.sunskyPayableTotal <= cutoff.sunskyPayableTotal;
  });
}

/**
 * PURE. The total for the count ("624 holidays"), from the groups' result snapshots (Ch 1 §2):
 * known only when every group has answered without an error and with a count; else null (the
 * page then shows what is loaded, with "+").
 */
export function packageTotal(groups) {
  if (!groups.length || !groups.every((g) => g.done && !g.error && Number.isFinite(g.count))) return null;
  return groups.reduce((n, g) => n + g.count, 0);
}

/** PURE. The cheapest package with an automatic from-price (the "Cheapest" badge in any order). */
export function cheapestPackage(list) {
  let best = null;
  for (const p of list || []) {
    if (p?.fromPriceEligible === false || !Number.isFinite(p?.sunskyPayableTotal)) continue;
    if (!best || p.sunskyPayableTotal < best.sunskyPayableTotal) best = p;
  }
  return best;
}

/** PURE. The destinations whose packages cannot be calculated yet (missing cache data). */
export function unknownDestinations(groups) {
  const out = [];
  for (const g of groups) for (const [d, s] of Object.entries(g.destinationStatus || {})) {
    if (s?.status === 'UNKNOWN') out.push(d);
  }
  return [...new Set(out)];
}

/** The answers that mean "certainly no package here: no flight" (not "not calculated yet"). */
const NO_FLIGHT = new Set(['NO_VALID_FLIGHT', 'NO_ARRIVAL_AIRPORT']);

/**
 * PURE. The places to name in "No flight + hotel packages to … for these dates" (9 Oct 2026: a
 * 3-country January search showed only Spain, with no word on Albania and Bulgaria). Only once
 * every group has answered without an error, so a destination still loading or failed is never
 * called "no flights". A country is named when none of its searched destinations has a package
 * for that reason; otherwise the destinations themselves. `cities`: { code, countryCode }.
 *
 * @returns {{ countries: string[], destinations: string[] }}
 */
export function noFlightPlaces(groups, cities = []) {
  const none = { countries: [], destinations: [] };
  if (!groups.length || !groups.every((g) => g.done && !g.error)) return none;
  const status = Object.assign({}, ...groups.map((g) => g.destinationStatus || {}));
  const searched = [...new Set(groups.flatMap((g) => g.dests || []))];
  const noFlight = new Set(searched.filter((d) => status[d]?.status === 'NOT_FEASIBLE' && NO_FLIGHT.has(status[d]?.reason)));
  if (!noFlight.size) return none;
  const countryOf = new Map((cities || []).map((c) => [c.code, c.countryCode || null]));
  const byCountry = new Map();
  for (const d of searched) {
    const c = countryOf.get(d);
    if (!c) continue;
    if (!byCountry.has(c)) byCountry.set(c, []);
    byCountry.get(c).push(d);
  }
  const countries = [];
  const covered = new Set();
  for (const [c, dests] of byCountry) {
    if (dests.every((d) => noFlight.has(d))) { countries.push(c); dests.forEach((d) => covered.add(d)); }
  }
  return { countries, destinations: [...noFlight].filter((d) => !covered.has(d)) };
}

/** PURE. Board facets summed over the groups (each group covers other destinations). */
export function mergeBoardFacets(groups) {
  const out = {};
  for (const g of groups) for (const [b, n] of Object.entries(g.boardFacets || {})) out[b] = (out[b] || 0) + (Number(n) || 0);
  return out;
}

/**
 * PURE. The airports the package answers PROVE (Ch 1 §9A, ResultFacetFeasibility): the departure
 * and arrival airports through which at least one hotel left after every other filter has a
 * package. `null` = not proven either way, and nothing may be hidden for it: a group still
 * loading or failed, an incomplete answer (stays left unpriced), an answer without facets, or a
 * search that itself chose airports on that side (it only looked at those).
 *
 * @param {object[]} groups  the package groups (page 1's `airportFacets` on each)
 * @param {{ origins?: string, arrivals?: string }} body  the /packages body that was sent
 * @returns {{ origins: Set<string>|null, arrivals: Set<string>|null }}
 */
export function mergeAirportFacets(groups, body = {}) {
  const proven = groups.length > 0 && groups.every((g) => g.done && !g.error && g.airportFacets?.complete === true);
  if (!proven) return { origins: null, arrivals: null };
  const side = (k) => new Set(groups.flatMap((g) => Object.entries(g.airportFacets[k] || {}).filter(([, n]) => n > 0).map(([a]) => a)));
  return {
    origins: body.origins ? null : side('origins'),
    arrivals: body.arrivals ? null : side('arrivals'),
  };
}

export default { PACKAGE_CONCURRENCY, chunkDestinations, packageBody, mapPackage, mergePackages, groupsToExtend, randomOrder, packageTotal, cheapestPackage, noFlightPlaces, unknownDestinations, mergeBoardFacets, mergeAirportFacets, DEST_CHUNK, PACKAGE_PAGE, PRECALC_NIGHTS };

/**
 * PURE. Hotels per destination across the package groups (UI-13, Ch 1 §5).
 *
 * `null` means no number may be shown, and it is returned generously:
 *  - a group that has not answered yet (the page asks per destination group, and a count that
 *    is still settling printed as a final figure is simply wrong);
 *  - a group that failed;
 *  - any answer flagged `complete: false`, which is the backend saying the same thing.
 *
 * The counts are already unique hotels per destination, so summing across groups cannot
 * double-count: each group covers its own destinations. That is also what keeps a hotel from
 * being counted twice when both its country and its destination are ticked, because the country
 * total is the sum of ITS destinations rather than a separate tally.
 *
 * @param {object[]} groups  the package groups, page 1's `destinationFacets` on each
 * @returns {Object<string, number>|null}
 */
export function mergeDestinationCounts(groups) {
  if (!Array.isArray(groups) || !groups.length) return null;
  const out = {};
  for (const g of groups) {
    if (!g?.done || g.error) return null;
    const f = g.destinationFacets;
    if (!f || f.complete === false) return null;
    for (const [code, n] of Object.entries(f.counts || {})) {
      out[code] = (out[code] || 0) + (Number(n) || 0);
    }
  }
  return out;
}
