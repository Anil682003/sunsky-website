// Holiday Themes on the results page (Levent, 17-18 Nov 2026). The sidebar's "Holiday Themes" group
// lists the active themes (All Inclusive, Honeymoon, …) that have holidays in the search; the
// holiday types (Zonvakanties, Stedentrips, …) stay in their own group (`themes`, OR).
//
// A ticked theme (`hthemes`, its id) searches its feature rule, read by the same ruleParams as its
// menu link. Levent, 18 Nov 2026: Holiday Themes are AND — the SAME offer must match every ticked
// theme — and every filter group is AND with the others. So each theme is added as conditions of
// its own, never folded into a list that the search reads as "either":
//   stars, accommodation, segments, holiday types → the admin ORs a list of those, so each theme's
//                    values become an `any` group of their own ("stars:4;stars:5"), ANDed with the rest
//   boards        → one offer has one board: the boards every source accepts (sidebar ∩ each theme);
//                    none in common → a board nothing has, so the search is honestly empty
//   facilities, kids, activities, offers, room features → each one is required already: added
//   the rule's own Match any / MIN N / OR groups → `any` groups of their own (as the menu link)
//   a theme without a rule → adds nothing (19 Nov 2026). Its place/hotel assignments match no hotel
//                    (0 in every destination), so `themes:<id>` emptied e.g. the Last Minutes card,
//                    whose meaning is the link's own date window (entry=last_minute)
//
// Only what is SEARCHED changes (the committed `applied` filters); the sidebar keeps showing what
// the traveller ticked.
import { ruleParams } from './themeRule';

/** A list of these is read as "either" by the search (admin facets.js / the cache's boards). */
const EITHER_KEYS = new Set(['stars', 'accommodation', 'segments', 'themes']);
/** Each value of these is required on its own: adding values adds conditions. */
const EACH_KEYS = new Set(['facilities', 'kids', 'activities', 'promos', 'roomFeatures']);
const NUMERIC = new Set(['themes', 'stars', 'facilities', 'accommodation', 'kids', 'segments']);
const UPPER = new Set(['boards', 'promos', 'roomFeatures']);
/** No offer has this board: the search for an impossible board combination is empty, not wider. */
export const NO_BOARD = 'NO_BOARD';

/** The values of one rule parameter, typed as the URL seed types them (Results seedFilters). */
function valuesOf(key, csv) {
  const raw = String(csv).split(',').map((v) => v.trim()).filter(Boolean);
  if (NUMERIC.has(key)) return raw.map(Number).filter(Number.isFinite);
  if (UPPER.has(key)) return raw.map((v) => v.toUpperCase());
  if (key === 'activities') {
    return raw.map((v) => v.match(/^(?:(\d+):)?(\d+)$/)).filter(Boolean).map((m) => (m[1] ? `${m[1]}:${m[2]}` : Number(m[2])));
  }
  return raw;
}

const union = (a, b) => {
  const out = [...(a || [])];
  for (const v of b) if (!out.some((x) => String(x) === String(v))) out.push(v);
  return out;
};

/**
 * PURE. `filters` with the ticked themes' rules added as conditions (AND). `rules`: Map id → rule
 * (null = the theme has no rule). A ticked theme not in `rules` (not loaded yet, or switched off)
 * adds nothing. Returns `filters` itself when nothing is added.
 */
export function withHolidayThemes(filters, rules) {
  const ids = filters?.hthemes || [];
  if (!ids.length || !rules?.size) return filters;
  let out = null;
  const next = () => (out ||= { ...filters });
  const groups = [];
  let boards = filters.boards?.length ? filters.boards.map((b) => String(b).toUpperCase()) : null;
  for (const id of ids) {
    if (!rules.has(Number(id))) continue;
    const rule = rules.get(Number(id));
    if (!rule?.criteria?.length) continue;   // no rule: the link's own parameters are the theme
    for (const [key, value] of ruleParams(rule.criteria, rule)) {
      if (key === 'show') continue;   // information only, never a filter
      const o = next();
      if (key === 'any') groups.push(value);
      else if (key === 'excludeAdultsOnly') o.excludeAdultsOnly = true;
      else if (key === 'adultsOnly') o.adultsOnly = true;
      else if (key === 'boards') {
        const mine = valuesOf(key, value);
        boards = boards ? boards.filter((b) => mine.includes(b)) : mine;
      } else if (EITHER_KEYS.has(key)) groups.push(valuesOf(key, value).map((v) => `${key}:${v}`).join(';'));
      else if (EACH_KEYS.has(key)) o[key] = union(o[key], valuesOf(key, value));
    }
  }
  if (!out) return filters;
  if (groups.length) out.any = [out.any, ...groups].filter(Boolean).join('|');
  if (boards) out.boards = boards.length ? boards : [NO_BOARD];
  return out;
}

/** PURE. id → rule (or null) of the theme list GET /website/holiday-types?category=Theme returns. */
export function themeRulesOf(list) {
  const m = new Map();
  for (const t of Array.isArray(list) ? list : []) {
    if (t?.category !== 'Theme') continue;
    const id = Number(t.id);
    if (Number.isFinite(id)) m.set(id, t.search && Array.isArray(t.search.criteria) ? t.search : null);
  }
  return m;
}

/**
 * PURE. A /results link with Holiday Theme `id` TICKED (`hthemes=id`) instead of applied out of
 * sight (Levent, 18 Nov 2026: an entry point that applies a theme shows it selected in the sidebar,
 * removable). The theme's id is taken out of `themes` (the holiday-type filter) if it was there;
 * the link's other parameters stay. Not a /results link: unchanged.
 */
export function withThemeTicked(href, id) {
  const n = id === null || id === undefined || id === '' ? NaN : Number(id);   // Number(null) is 0
  if (!href || !String(href).startsWith('/results') || !(Number.isInteger(n) && n > 0)) return href;
  const i = href.indexOf('?');
  const path = i < 0 ? href : href.slice(0, i);
  const qs = new URLSearchParams(i < 0 ? '' : href.slice(i + 1));
  const themes = (qs.get('themes') || '').split(',').filter((v) => v && Number(v) !== n);
  if (themes.length) qs.set('themes', themes.join(',')); else qs.delete('themes');
  const ticked = new Set((qs.get('hthemes') || '').split(',').filter(Boolean));
  ticked.add(String(n));
  qs.set('hthemes', [...ticked].join(','));
  return `${path}?${qs.toString()}`;
}
