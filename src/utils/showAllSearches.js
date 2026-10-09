// The homepage's "Show all" searches, worked out from the dashboard's homepage config, in ONE place:
// the homepage sections build their links from these, and the warmer (scripts/warm-show-all.mjs)
// pre-computes exactly the searches behind those links. Plain functions, no browser, no React, so
// both can use them.
//
//   1. "Something for everyone" (Categories): one search over every place on the featured cards
//   2. "Our best sun destinations" (Destinations): one search per country tab
//   3. the empty search: no place at all — every destination (see EMPTY_SEARCH_URLS)

import { normalizeDests, sectionSearchUrl } from './cmsDestinations.js';

// The categories grid is built for exactly four cards; the CMS decides which holiday types fill
// them (Homepage Settings → Featured Holiday Types).
export const MAX_CATEGORY_CARDS = 4;

const slugify = (s) =>
  String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Which cards the categories section shows, and the places each one links. The section adds the
 * artwork and wording; the places — and so "Show all" — come from here.
 *
 *   featured types + live types → the featured ones that still exist (`type`, `featured`)
 *   live types, nothing featured → the first types, no places
 *   no live types (API down)    → the CMS categories (`cmsCategory`), or `fallbackCount` blanks
 *
 * `index` is the card's place in the dashboard's list (the section picks fallback artwork by it).
 *
 * @returns {{ type?: object, featured?: object, index?: number, cmsCategory?: object, destinations: object[] }[]}
 */
export function categoryCards(cms, types = [], { fallbackCount = 0 } = {}) {
  const featured = (cms?.featuredHolidayTypes ?? []).filter(
    (f) => f && (f.holidayTypeId != null || f.title) && f.active !== false
  );
  const cmsCats = cms?.categories ?? [];
  let cards;
  if (featured.length > 0 && types.length > 0) {
    cards = featured
      .map((f, index) => {
        const type =
          types.find((x) => String(x.id) === String(f.holidayTypeId)) ||
          types.find((x) => slugify(x.name) === slugify(f.title));
        return type ? { type, featured: f, index, destinations: normalizeDests(f.destinations) } : null;
      })
      .filter(Boolean);
  } else if (types.length > 0) {
    cards = types.map((type, index) => ({ type, index, destinations: normalizeDests(undefined) }));
  } else if (cmsCats.length > 0) {
    cards = cmsCats.map((c) => ({ cmsCategory: c, destinations: normalizeDests(c.destinations) }));
  } else {
    cards = Array.from({ length: fallbackCount }, () => ({ destinations: [] }));
  }
  return cards.slice(0, MAX_CATEGORY_CARDS);
}

/** The categories section's "Show all": every place its cards feature, in one search (or null). */
export const categoriesShowAllUrl = (cms, types = []) =>
  sectionSearchUrl({ dests: categoryCards(cms, types).flatMap((c) => c.destinations) });

/**
 * The destinations section's tabs as the dashboard configured them, each card with the place it
 * links (or null), and each tab's "Show all": every linked card at once, under the tab's name.
 * Null when the dashboard has no tabs (the section then shows its built-in demo tabs, unlinked).
 *
 * @returns {null | { label: string, cards: { card: object, dest: object|null }[], showAllUrl: string|null }[]}
 */
export function destinationTabs(cms) {
  const tabs = cms?.destinationTabs;
  if (!tabs?.length) return null;
  return tabs.map((tab, i) => {
    const label = tab.tab || `Tab ${i + 1}`;
    const cards = (tab.cards || []).map((card) => {
      // A card is clickable only once the dashboard links it to a real country/city.
      const [dest] = normalizeDests(card.dest ? [card.dest] : []);
      return { card, dest: dest || null };
    });
    return { label, cards, showAllUrl: sectionSearchUrl({ dests: cards.map((c) => c.dest), label }) };
  });
}

/**
 * The empty search, in the two forms it reaches the results page:
 *   - a bare link to /results (no place, no dates)
 *   - the homepage search with nothing picked: its defaults — Package, 2 adults, 1 room, the
 *     "6-10 days" band, no date (Hero.jsx: `transport` and `duration` defaults, buildBaseParams)
 * Both search every destination with inventory, cheapest first.
 */
export const EMPTY_SEARCH_URLS = [
  '/results',
  '/results?checkIn=&checkOut=&adults=2&children=0&rooms=1&duration=6-10+days&minNights=5&maxNights=9&transport=package&destination=',
];

/** Every "Show all" search behind the homepage, de-duplicated. */
export function showAllSearchUrls(cms, types = []) {
  const urls = [
    categoriesShowAllUrl(cms, types),
    ...(destinationTabs(cms) ?? []).map((t) => t.showAllUrl),
    ...EMPTY_SEARCH_URLS,
  ].filter(Boolean);
  return [...new Set(urls)];
}
