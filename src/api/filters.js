// filters.js — website content-filter API (holiday theme, geo cascade).
//
// The search flow: the site asks the ADMIN content API which hotels match the chosen
// content filters, gets back a list of hotelCodes, and passes those to the CACHE price
// search (/contracts/cheapest?hotelCodes=...). This module is the admin half.
//
// Admin calls go through axiosInstance, whose baseURL already ends in /api, so the paths
// here are relative to /api (endpoints live at /api/hotel-filters/*).
import axiosInstance from '../services/axiosInstance';

/**
 * Holiday/theme types for the filter chips.
 * With a destinationCode → only themes that apply to THAT destination, each with a hotel
 * count: [{ id, name, icon, hotels }]. Without → the full list.
 */
export async function fetchThemes(destinationCode) {
  const params = destinationCode ? { destinationCode } : {};
  const { data } = await axiosInstance.get('/hotel-filters/themes', { params });
  return data?.data ?? [];
}

/**
 * Home-page typeahead: search destinations, AREAS and hotels by name in one call.
 *
 * Three kinds of answer to "Side": the city it is in, the AREA itself (every hotel in Side —
 * `zones`, each with a `hotels` count and the (destinationCode, zoneCode) pair that scopes a
 * results URL), and hotels whose name contains it.
 *
 * Each hotel carries `image` — the URL of its master photo as a thumbnail, or null when the
 * hotel has none (~8% of them), in which case the caller keeps its icon.
 *
 * Pass an AbortSignal so a superseded keystroke's request is cancelled rather than merely
 * ignored; an aborted call resolves to the empty result, never throws.
 *
 * Each hotel also carries `zoneName` — its resort area inside the city ("Side" in Antalya) — or
 * null when it sits in no zone. The dropdown shows it ahead of the city.
 *
 * @returns {Promise<{ destinations:{code,name,country}[], zones:{zoneCode,name,destinationCode,destinationName,country,hotels}[], hotels:{hotelCode,name,destinationCode,destinationName,zoneName,country,stars,image}[] }>}
 */
export async function searchDestinationsAndHotels(q, limit = 6, { signal } = {}) {
  const query = String(q ?? '').trim();
  const empty = { destinations: [], zones: [], hotels: [] };
  if (query.length < 2) return empty;
  try {
    const { data } = await axiosInstance.get('/hotel-filters/search', { params: { q: query, limit }, signal });
    // `zones` defaulted, so a response from an older backend can't crash the dropdown.
    return { ...empty, ...(data?.data ?? {}) };
  } catch {
    return empty;
  }
}

/** Countries that have hotels → [{ code, isoCode, name, flag, flagUrl }]. Cascade level 1. */
export async function fetchCountries() {
  const { data } = await axiosInstance.get('/hotel-filters/countries');
  return data?.data ?? [];
}

/**
 * Destinations (cities) in one or more countries that have hotels. Cascade level 2.
 * @param {string|string[]} countryCode one code or a list
 * @returns {Promise<{code,name,countryCode,countryName,flag,flagUrl}[]>}
 */
export async function fetchDestinations(countryCode) {
  const codes = Array.isArray(countryCode) ? countryCode : [countryCode].filter(Boolean);
  if (!codes.length) return [];
  const { data } = await axiosInstance.get('/hotel-filters/destinations', {
    params: { countryCode: codes.join(',') },
  });
  return data?.data ?? [];
}

/**
 * Zones inside the given destinations that have hotels. Cascade level 3.
 * @returns {Promise<{zoneCode,name,destinationCode,destinationName}[]>}
 */
export async function fetchZones(destinationCodes) {
  const codes = Array.isArray(destinationCodes) ? destinationCodes : [destinationCodes].filter(Boolean);
  if (!codes.length) return [];
  const { data } = await axiosInstance.get('/hotel-filters/zones', {
    params: { destinationCodes: codes.join(',') },
  });
  return data?.data ?? [];
}

/**
 * Airports a traveller can fly INTO, each already resolved to the destination codes it
 * serves — the "Flying to" filter's option list.
 *
 * The admin side only returns airports linked to at least one destination that has bookable
 * hotels, so every option here narrows the search to something real. That is why the list is
 * fetched rather than hardcoded: an airport the team links in the dashboard shows up on its
 * own, and one with nothing behind it never appears.
 *
 * @param {string|string[]} countryCode scope the list to the countries in the current search
 * @returns {Promise<{code,name,countryCode,countryName,flag,destinations:string[],cityNames:string[],zoneCodes:string[]}[]>}
 */
export async function fetchArrivalAirports(countryCode, { signal } = {}) {
  const codes = Array.isArray(countryCode) ? countryCode : [countryCode].filter(Boolean);
  const { data } = await axiosInstance.get('/hotel-filters/arrival-airports', {
    params: codes.length ? { countryCode: codes.join(',') } : {},
    signal,
  });
  return data?.data ?? [];
}

/**
 * Departure airports the agency sells FROM — the §25 Sunsky master list, held in the admin
 * dashboard (not hard-coded here). With no params → the full master list. With
 * `{ destination, checkIn, checkOut }` → each airport is annotated with §26 validity (does a
 * real flight to that destination exist for those dates) and `filtered` holds only the valid
 * ones; `cacheHasData` is false when the flight cache has nothing for the destination yet
 * (in which case NOTHING is hidden — the full list is returned).
 *
 * @returns {Promise<{airports:object[], filtered:object[]|null, cacheHasData:boolean}>}
 */
export async function fetchDepartureAirports(params = {}, { signal } = {}) {
  const { data } = await axiosInstance.get('/flight-availability/departure-airports', { params, signal });
  return { airports: data?.airports ?? [], filtered: data?.filtered ?? null, cacheHasData: !!data?.cacheHasData };
}

/**
 * The flight half of a Flight + Hotel from-price (§33): the cheapest ELIGIBLE flight (Sunsky
 * §23 priority) from one departure airport to each requested arrival airport, for the search
 * dates. Returns `{ [arrivalCode]: { price, currency, priorityClass, stops } | null }` — the
 * website adds each fare to the matching hotel's cached price to build the package total.
 * Empty/`null` for a route means no eligible flight (the hotel stays sellable hotel-only, §35).
 */
export async function fetchPackageFares({ origin, checkIn, checkOut, adults, children, arrivals }, { signal } = {}) {
  const { data } = await axiosInstance.get('/flight-availability/package-fares', {
    params: {
      origin, checkIn, checkOut, adults, children,
      arrivals: Array.isArray(arrivals) ? arrivals.join(',') : arrivals,
    },
    signal,
  });
  return data?.fares ?? {};
}

/**
 * Resolve the content filters to matching hotelCodes (+ attributes).
 * Pass the SEARCH destination so the set stays bounded and fast.
 *
 * @returns {Promise<{ count:number, hotelCodes:string[], attributes:Record<string,object> }>}
 */
export async function fetchMatchingHotels({ destinationCode, countryCode, themes = [] } = {}) {
  const params = {};
  if (destinationCode) params.destinationCode = destinationCode;
  if (countryCode)     params.countryCode = countryCode;
  if (themes.length)   params.themes = themes.join(',');
  const { data } = await axiosInstance.get('/hotel-filters/hotels', { params });
  return data?.data ?? { count: 0, hotelCodes: [], attributes: {} };
}

/**
 * Faceted search over a SCOPE of countries and/or destinations (multi-country search).
 * Returns the matching hotelCodes (+ attributes) AND every content facet with a count —
 * holiday, stars, facilities, activities — the way the reference site shows them.
 *
 * The optional `filters` narrow the returned hotelCodes (a hotel must match ALL selected
 * facets); the facet COUNTS stay at scope level so every option stays visible with its count.
 *
 * ASK ONLY FOR WHAT YOU WILL USE. `hotelCodes` matter only when a content facet is selected
 * (they restrict the cache); the per-hotel `attributes` map matters only for a client-side
 * distance sort. A whole-country search is ~8k hotels: requesting both makes the response
 * ~1 MB, requesting neither makes it ~7 KB. Hence the explicit opt-ins below — the server
 * then aggregates the match in SQL instead of shipping every row.
 *
 * @param {{ countries?: string[], destinations?: string[] }} scope
 * @param {{ themes?, stars?, facilities?, activities?, accommodation?, kids?, maxBeach?, maxCentre? }} [filters]
 * @param {{ codes?: boolean, attrs?: boolean, signal?: AbortSignal }} [opts]
 * @returns {Promise<{
 *   scope:{ countries:string[], destinations:string[], hotelCount:number },
 *   matchedDestinations:string[],
 *   hotelCodes?:string[],
 *   attributes?:Record<string,object>,
 *   included:{ hotelCodes:boolean, attributes:boolean },
 *   facets:{ holiday, stars, facilities, activities, accommodation, kids, beachDistance, centreDistance }
 * }>}
 */
export async function fetchFacets({ countries = [], destinations = [], zones = [] } = {}, filters = {}, opts = {}) {
  const { codes = true, attrs = true, signal } = opts;
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
  if (!codes) params.codes = '0';
  if (!attrs) params.attrs = '0';
  const empty = {
    scope: { countries, destinations, hotelCount: 0 },
    matchedDestinations: [], hotelCodes: [], attributes: {},
    included: { hotelCodes: false, attributes: false },
    facets: { holiday: [], stars: [], facilities: [], activities: [], accommodation: [], kids: [], beachDistance: [], centreDistance: [] },
  };
  if (!countries.length && !destinations.length) return empty;
  const { data } = await axiosInstance.get('/hotel-filters/facets', { params, signal });
  return data?.data ?? empty;
}
