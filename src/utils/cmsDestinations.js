// Destinations an admin picks per featured holiday type in the dashboard
// (Homepage Settings → Featured Holiday Types → Destinations).
//
// The same list drives two surfaces, so the shaping and link-building live here
// rather than in either page: the /holidays/:slug grid, and the expandable slip
// on the homepage Categories card.

import { entryOf, ALL_INCLUSIVE } from './entryRules.js';  // .js: scripts/warm-show-all.mjs imports this file under plain Node

// Mirrors the CMS and backend caps (dashboard MAX_FEATURED_DESTINATIONS and the API's
// normalizeFeaturedDestinations, which slices on read). All three move together: 24 clears the
// largest real holiday type, which links 21 countries.
export const MAX_DESTS = 24;

// CMS destinations are free-form JSON — keep only entries that can actually
// build a search link, so a half-filled dashboard row never renders a dead card.
export const normalizeDests = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((d) => d && d.code && (d.type === 'country' || d.type === 'city'))
    .slice(0, MAX_DESTS);

export const destLabel = (d) =>
  d.type === 'city' && d.countryName ? `${d.name}, ${d.countryName}` : d.name || d.code;

// Homepage links open Flight + Hotel (the product the site sells, and the hero's default): with
// `transport=package` the results page lists complete packages, from the precalculated default
// search when the link carries no dates (7 Oct 2026).
export const PACKAGE_TRANSPORT = 'package';

// The results page scopes a search by Hotelbeds codes: whole countries go in
// `countries`, single cities in `destinations` — the same params the results
// sidebar itself writes back. Dates are deliberately omitted; Results defaults
// to a 7-night stay 30 days out when they are absent.
/**
 * A card's departure window, as search params (UI-21). Applies to the travel START only, which
 * is why the names say `start`: a return may legitimately fall after `startTo`.
 */
const applyRange = (qs, range) => {
  if (!range?.from || !range?.to) return;
  qs.set('startFrom', range.from);
  qs.set('startTo', range.to);
};

export const destUrl = (d, holidayTypeId = null, entry = null, range = null) => {
  const qs = new URLSearchParams();
  qs.set(d.type === 'country' ? 'countries' : 'destinations', d.code);
  const label = destLabel(d);
  if (label) qs.set('destinationLabel', label);
  // Two types are doors rather than filters (§12B.2, UI-20): Last Minute brings a departure
  // window with it and All Inclusive a board restriction. The server applies either one only
  // where the traveller has not already chosen, so this names the door and nothing more.
  const door = entryOf(entry);
  if (door) qs.set('entry', door);
  // Reached through a holiday type (Zonvakanties → Turkije): the type stays in the search, so the
  // results open with it already applied (Master Ch 1 §12B.1 / §12B.4). Without it a country
  // search shows all its hotels, Istanbul's city trips included.
  //
  // Only ever for a type the catalogue can answer as a filter, which means one the dashboard
  // links to countries or destinations: `themes=` resolves through those, so countries=ES with
  // themes=2 is Spain's city trips rather than Spain entire. A door is not such a type, and
  // neither is a hotel-content one. Measured against the live catalogue on 16 Oct 2026: a
  // `themes=` for Last Minute, All Inclusive, Adults only or Beachfront matches zero hotels, so
  // sending it beside the door would turn a working search into an empty page.
  if (!door && holidayTypeId != null && holidayTypeId !== '') qs.set('themes', String(holidayTypeId));
  applyRange(qs, range);
  qs.set('transport', PACKAGE_TRANSPORT);
  return `/results?${qs.toString()}`;
};

/** The slug the catalogue knows a holiday type by, from the id a CMS link stores. */
const slugForTypeId = (id, types) => {
  if (id == null || id === '') return '';
  const row = (Array.isArray(types) ? types : []).find((t) => String(t?.id) === String(id));
  return row?.slug || '';
};

/**
 * PURE. The door a popular-destination link opens, or null for an ordinary link.
 *
 * Two of the dashboard's choices are doors rather than filters, and both were being sent as
 * filters, which is why these links came back slow and empty:
 *
 *   Holiday type "Last Minutes" travelled as `themes=12`. That type is tagged on no hotel, so
 *   the search intersected to nothing: every hotel in the scope was priced and then thrown
 *   away. It is a departure window, not a hotel theme.
 *
 *   Board "All Inclusive" travelled as `boards=AI`, which is the AI code alone. The door means
 *   the AI FAMILY, so Ultra All Inclusive and the mapped boards were being excluded from a link
 *   whose whole promise is all-inclusive.
 *
 * The type is matched by its SLUG, never its id or its display name: ids are per-environment
 * data, and the dashboard names this type "Last Minutes" while the entry is `last_minute`. The
 * slug (`last-minute`) is what `entryOf` already normalises, which is also what UI-19 uses, so
 * the two agree by construction rather than by a second list kept in step by hand.
 *
 * Without `types` nothing is recognised and the link keeps its old shape. That is deliberate:
 * a caller that cannot resolve slugs should not guess from an id.
 */
export function linkEntry(link, types) {
  const fromType = entryOf(slugForTypeId(link?.holidayTypeId, types));
  if (fromType) return fromType;
  if (String(link?.boardCode ?? '').trim().toUpperCase() === 'AI') return ALL_INCLUSIVE;
  return null;
}

/**
 * A quick link under a "Most popular destinations" group. Any combination of a
 * place, a board type and a holiday type — "Turkey All Inclusive" is a country
 * plus a board, "Last Minute Spain" a holiday type plus a country, "France by
 * Car" a country plus a holiday type.
 *
 * Legacy entries are plain strings (label only) and stay unlinked.
 * Returns null when there is nothing to filter by, so the caller renders text.
 */
export const groupLinkUrl = (link, types = null) => {
  if (!link || typeof link !== 'object') return null;
  const qs = new URLSearchParams();
  const d = link.dest;
  if (d && d.code && (d.type === 'country' || d.type === 'city')) {
    qs.set(d.type === 'country' ? 'countries' : 'destinations', String(d.code).trim().toUpperCase());
  }

  const door = linkEntry(link, types);
  if (door) qs.set('entry', door);

  // The board still travels, unless the door already says it: `entry=all_inclusive` means the
  // whole AI family, and adding `boards=AI` beside it would narrow straight back to one code.
  const board = String(link.boardCode ?? '').trim().toUpperCase();
  if (board && !(door === ALL_INCLUSIVE && board === 'AI')) qs.set('boards', board);

  // A holiday type travels as a filter only when it is not itself a door. See the note above
  // for why sending a door as `themes=` empties the search.
  const typeIsDoor = entryOf(slugForTypeId(link.holidayTypeId, types)) != null;
  if (!typeIsDoor && link.holidayTypeId != null && link.holidayTypeId !== '') {
    qs.set('themes', String(link.holidayTypeId));
  }
  if ([...qs.keys()].length === 0) return null;
  const label = link.label || d?.name || '';
  if (label) qs.set('destinationLabel', label);
  qs.set('transport', PACKAGE_TRANSPORT);
  return `/results?${qs.toString()}`;
};

/**
 * The search behind a section's "Show all": every place the section shows, at once. Countries
 * and cities keep their own params, as in destUrl, and `label` names the place in the results
 * heading ("Stays in Spain").
 *
 * Places only, deliberately. Adding the section's holiday types as a filter looks like the
 * faithful choice, but several types are tagged on no hotel at all (All inclusive and Last
 * minute are a board and a date, not hotel themes), and one such type in the query empties
 * the whole search. Each card in these sections searches its own place, unfiltered, and
 * "Show all" does the same for all of them.
 *
 * Returns null when no place is linked, so a section never shows a "Show all" that goes
 * nowhere.
 */
export const sectionSearchUrl = ({ dests = [], label = '', entry = null } = {}) => {
  const countries = new Set();
  const cities = new Set();
  (Array.isArray(dests) ? dests : []).forEach((d) => {
    if (!d?.code || (d.type !== 'country' && d.type !== 'city')) return;
    (d.type === 'country' ? countries : cities).add(String(d.code).trim().toUpperCase());
  });
  if (!countries.size && !cities.size) return null;

  const qs = new URLSearchParams();
  if (countries.size) qs.set('countries', [...countries].join(','));
  if (cities.size) qs.set('destinations', [...cities].join(','));
  if (label) qs.set('destinationLabel', label);
  // "Toon alles" through Last Minute or All Inclusive keeps that door's default (UI-20).
  const door = entryOf(entry);
  if (door) qs.set('entry', door);
  qs.set('transport', PACKAGE_TRANSPORT);
  return `/results?${qs.toString()}`;
};

/**
 * "Show all" on a holiday-type page: every stay of this category, nowhere in particular.
 *
 * Built from the type's SCOPE (the destinations and zones it actually covers), not from the
 * country cards on the page. The two differ, and the difference matters: a country is listed
 * when any destination inside it carries the type, so searching the countries returns Spain
 * entire when the category is three Spanish city breaks.
 *
 * The category is carried as that geography rather than as a theme filter, which is the only
 * way it works today. A holiday type sent as `themes=` matches on hotel content, and types
 * that are linked at country or destination level sit on no hotel at all, so the filter
 * intersects to nothing and the page comes back empty. Sending the destinations the type
 * resolves to asks the same question and gets an answer.
 *
 * `hotelCodes` from the scope are deliberately dropped: a type can carry thousands and they do
 * not fit in a URL. They are hotels outside the listed destinations, so leaving them out
 * narrows the search slightly rather than widening it, which is the safe direction.
 *
 * @returns a /results URL, or null when the type resolves to nowhere (the caller then keeps
 *          whatever link it had, rather than offering one that searches everything).
 */
export const holidayScopeSearchUrl = ({ destinations = [], zones = [], label = '', range = null } = {}) => {
  const codes = [...new Set((Array.isArray(destinations) ? destinations : [])
    .map((d) => String(d ?? '').trim().toUpperCase()).filter(Boolean))];
  // The scope reports a zone as { destination, zone }; the results page wants the zone codes.
  const zoneCodes = [...new Set((Array.isArray(zones) ? zones : [])
    .map((z) => String((z && typeof z === 'object' ? z.zone : z) ?? '').trim().toUpperCase())
    .filter(Boolean))];

  if (!codes.length && !zoneCodes.length) return null;

  const qs = new URLSearchParams();
  if (codes.length) qs.set('destinations', codes.join(','));
  if (zoneCodes.length) qs.set('zones', zoneCodes.join(','));
  if (label) qs.set('destinationLabel', label);
  applyRange(qs, range);
  qs.set('transport', PACKAGE_TRANSPORT);
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
const cardForHolidayType = (cms, { id, slug } = {}) =>
  (cms?.featuredHolidayTypes ?? []).find((f) => {
    if (!f) return false;
    if (id != null && f.holidayTypeId != null) return String(f.holidayTypeId) === String(id);
    return slug ? slugify(f.title) === slug : false;
  });

export const destsForHolidayType = (cms, { id, slug } = {}) =>
  normalizeDests(cardForHolidayType(cms, { id, slug })?.destinations);

/**
 * The departure window a homepage card carries (UI-21, Ch1 §12B.3), or null.
 *
 * The dashboard stores `startDate` and `endDate` on a Travel Categories card whether or not the
 * range is switched on, so the flag decides, not the presence of the dates. "Enable Date Range =
 * NO: stored dates have no effect" is the acceptance case, and it is the whole reason this reads
 * `enableDateRange` rather than just checking for dates.
 *
 * The window applies to the travel START only: the outbound for a package, the check-in for a
 * hotel. A return may fall outside it, which is why this is not a "trip must fit inside" filter.
 */
export const dateRangeForHolidayType = (cms, { id, slug } = {}) => {
  const card = cardForHolidayType(cms, { id, slug });
  if (!card || card.enableDateRange !== true) return null;
  const from = String(card.startDate ?? '').slice(0, 10);
  const to = String(card.endDate ?? '').slice(0, 10);
  // A half-configured range is not a range. Applying one end of it would silently narrow the
  // search in a direction nobody chose.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  if (to < from) return null;
  return { from, to };
};
