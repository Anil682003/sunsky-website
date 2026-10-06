// The cache requests the results page sends for a link with no filters — exactly, so the "Show all"
// warmer (scripts/warm-show-all.mjs) pre-computes the searches visitors actually make. The cache
// keys a search on every input that changes its answer (destinations, dates, party, source,
// searchType, …); a request that differs in any of them warms a search nobody sends.
//
// Mirrors pages/Results/Results.jsx for these links: the scope (places, or every destination for
// the empty search), the default stay (30 days out, 7 nights), the party (2 adults, 1 room), the
// duration band and its exact lengths, and buildRequest's body. Results.warmParity.test.jsx renders
// the page for every homepage "Show all" link and requires the requests to be identical, so the
// two cannot drift apart. Plain functions, no browser, no React.

import { bandByLabel, bandForNights, daysToNights, stayNights, stayCheckOut, withinStayNightLimit, MAX_TRAVEL_DAYS } from './durations.js';
import { defaultSearchContext } from './searchDefaults.js';

export const PAGE_SIZE = 20;          // Results.jsx PAGE_SIZE
export const COUNT_PAGE_SIZE = 100;   // the Travel-time counts ask for 100 (Results.jsx)
const MANY_DESTINATIONS = 8;          // Results.jsx: above this many, the request is a POST

const csv = (s) => (s ? String(s).split(',').map((x) => x.trim()).filter(Boolean) : []);
const addNights = (ci, n) => { const d = new Date(`${ci}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().split('T')[0]; };
const nightsBetween = (ci, co) => {
  if (!ci || !co) return null;
  const n = Math.round((new Date(`${co}T00:00:00Z`) - new Date(`${ci}T00:00:00Z`)) / 86400000);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** The scope a results link searches: its places, or — no place at all — every destination. */
export function linkScope(params) {
  const countries = csv(params.get('countries'));
  const dests = [...new Set([...csv(params.get('destinations')), ...csv(params.get('cities'))])];
  const legacy = params.get('destination') || '';
  const explicit = dests.length ? dests : (legacy ? [legacy] : []);
  const emptySearch = !countries.length && !explicit.length;
  return { countries, destinations: explicit, zones: csv(params.get('zones')), emptySearch };
}

/** The stay, party and exact lengths a results link prices, with the page's defaults. */
export function linkStay(params, now = new Date()) {
  const defaults = defaultSearchContext(now);
  const checkIn = params.get('checkIn') || defaults.checkIn;
  const asked = params.get('checkOut') || defaults.checkOut;
  const n = stayNights(checkIn, asked);
  const checkOut = n == null
    ? (stayCheckOut(checkIn, 8) || defaults.checkOut)
    : (withinStayNightLimit(n) ? asked : stayCheckOut(checkIn, MAX_TRAVEL_DAYS));
  const duration = params.get('duration') || '';
  const band = duration ? bandByLabel(duration) : bandForNights(nightsBetween(checkIn, checkOut));
  const minN = daysToNights(band.minDays);
  const maxN = daysToNights(band.maxDays);
  return {
    checkIn,
    checkOut,
    adults: params.get('adults') || '2',
    children: params.get('children') || '0',
    rooms: params.get('rooms') || '1',
    childAges: params.get('childAges') || '',
    packageSearch: params.get('transport') === 'package',
    lengths: Array.from({ length: maxN - minN + 1 }, (_, i) => minN + i),
  };
}

/** One /contracts/cheapest request, as Results.jsx buildRequest makes it (no filters). */
export function cheapestRequest(baseUrl, stay, destinations, { checkOut = stay.checkOut, pageSize = PAGE_SIZE, page = 1 } = {}) {
  const rooms = Math.max(1, parseInt(stay.rooms, 10) || 1);
  const body = {
    destinations,
    checkIn: stay.checkIn,
    checkOut,
    adults: stay.adults,
    children: stay.children,
    rooms: String(rooms),
    limit: String(pageSize),
    pageSize: String(pageSize),
    page: String(page),
    source: 'combined',
    maxAdultsPerRoom: String(Math.ceil((parseInt(stay.adults, 10) || 1) / rooms)),
    maxChildrenPerRoom: String(Math.ceil((parseInt(stay.children, 10) || 0) / rooms)),
  };
  if (stay.childAges) body.childAges = stay.childAges;
  if (stay.packageSearch) body.searchType = 'PACKAGE';
  if (body.destinations.length > MANY_DESTINATIONS) {
    return { url: `${baseUrl}/contracts/cheapest`, opts: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } };
  }
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) qs.set(k, Array.isArray(v) ? v.join(',') : v);
  return { url: `${baseUrl}/contracts/cheapest?${qs.toString()}`, opts: {} };
}

/**
 * Every cache request the results page sends for a link: page 1, then one count per exact length
 * in the band (the Travel-time filter). `destinations` is what the page prices: the admin's
 * matched destinations for the link's scope (facets), or the scope's own list.
 *
 * A Flight + Hotel link (transport=package) sends none (7 Oct 2026): the page lists complete
 * packages from the admin's package search, whose default searches the admin precalculates.
 * Warming SunSkyCache for those links would only load it with searches nobody makes.
 */
export function cacheRequestsForLink(link, { baseUrl, destinations, now = new Date() }) {
  const params = new URLSearchParams(String(link).split('?')[1] || '');
  const stay = linkStay(params, now);
  if (stay.packageSearch) return [];
  return [
    cheapestRequest(baseUrl, stay, destinations),
    ...stay.lengths.map((n) => cheapestRequest(baseUrl, stay, destinations, { checkOut: addNights(stay.checkIn, n), pageSize: COUNT_PAGE_SIZE })),
  ];
}
