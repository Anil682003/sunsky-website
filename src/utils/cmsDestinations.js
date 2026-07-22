// Destinations an admin picks per featured holiday type in the dashboard
// (Homepage Settings → Featured Holiday Types → Destinations).
//
// The same list drives two surfaces, so the shaping and link-building live here
// rather than in either page: the /holidays/:slug grid, and the expandable slip
// on the homepage Categories card.

// Mirrors the CMS and backend caps.
export const MAX_DESTS = 6;

// CMS destinations are free-form JSON — keep only entries that can actually
// build a search link, so a half-filled dashboard row never renders a dead card.
export const normalizeDests = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((d) => d && d.code && (d.type === 'country' || d.type === 'city'))
    .slice(0, MAX_DESTS);

export const destLabel = (d) =>
  d.type === 'city' && d.countryName ? `${d.name}, ${d.countryName}` : d.name || d.code;

// The results page scopes a search by Hotelbeds codes: whole countries go in
// `countries`, single cities in `destinations` — the same params the results
// sidebar itself writes back. Dates are deliberately omitted; Results defaults
// to a 7-night stay 30 days out when they are absent.
export const destUrl = (d) => {
  const qs = new URLSearchParams();
  qs.set(d.type === 'country' ? 'countries' : 'destinations', d.code);
  const label = destLabel(d);
  if (label) qs.set('destinationLabel', label);
  return `/results?${qs.toString()}`;
};

/**
 * A quick link under a "Most popular destinations" group. Any combination of a
 * place, a board type and a holiday type — "Turkey All Inclusive" is a country
 * plus a board, "Last Minute Spain" a holiday type plus a country, "France by
 * Car" a country plus a holiday type.
 *
 * Legacy entries are plain strings (label only) and stay unlinked.
 * Returns null when there is nothing to filter by, so the caller renders text.
 */
export const groupLinkUrl = (link) => {
  if (!link || typeof link !== 'object') return null;
  const qs = new URLSearchParams();
  const d = link.dest;
  if (d && d.code && (d.type === 'country' || d.type === 'city')) {
    qs.set(d.type === 'country' ? 'countries' : 'destinations', String(d.code).trim().toUpperCase());
  }
  if (link.boardCode) qs.set('boards', String(link.boardCode).trim().toUpperCase());
  if (link.holidayTypeId != null && link.holidayTypeId !== '') {
    qs.set('themes', String(link.holidayTypeId));
  }
  if ([...qs.keys()].length === 0) return null;
  const label = link.label || d?.name || '';
  if (label) qs.set('destinationLabel', label);
  return `/results?${qs.toString()}`;
};

/** Display text for a group link, whether it is a legacy string or an object. */
export const groupLinkLabel = (link) =>
  typeof link === 'string' ? link : link?.label || link?.dest?.name || '';

const slugify = (s) =>
  String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * The destinations configured for one holiday type, resolved from the homepage
 * CMS config. Matches on id first, then on the cached title, so a card still
 * resolves if the dashboard stored a title but no id.
 */
export const destsForHolidayType = (cms, { id, slug } = {}) => {
  const entry = (cms?.featuredHolidayTypes ?? []).find((f) => {
    if (!f) return false;
    if (id != null && f.holidayTypeId != null) return String(f.holidayTypeId) === String(id);
    return slug ? slugify(f.title) === slug : false;
  });
  return normalizeDests(entry?.destinations);
};
