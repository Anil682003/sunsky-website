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
 * Home-page typeahead: search destinations AND hotels by name in one call.
 *
 * Each hotel carries `image` — the URL of its master photo as a thumbnail, or null when the
 * hotel has none (~8% of them), in which case the caller keeps its icon.
 *
 * Pass an AbortSignal so a superseded keystroke's request is cancelled rather than merely
 * ignored; an aborted call resolves to the empty result, never throws.
 *
 * @returns {Promise<{ destinations:{code,name,country}[], hotels:{hotelCode,name,destinationCode,destinationName,country,stars,image}[] }>}
 */
export async function searchDestinationsAndHotels(q, limit = 6, { signal } = {}) {
  const query = String(q ?? '').trim();
  const empty = { destinations: [], hotels: [] };
  if (query.length < 2) return empty;
  try {
    const { data } = await axiosInstance.get('/hotel-filters/search', { params: { q: query, limit }, signal });
    return data?.data ?? empty;
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
