// Holiday Themes on the results page (Levent, 17-18 Nov 2026). The sidebar's "Holiday Themes" group
// lists the active themes (All Inclusive, Honeymoon, …) that have holidays in the search; the
// holiday types (Zonvakanties, Stedentrips, …) stay in their own group (`themes`).
//
// A ticked theme (`hthemes`, its id) searches exactly what its link from the Holiday Types menu
// searches: its feature rule, read by the same ruleParams, merged on top of the traveller's own
// filters — so the theme and its menu link can never disagree. A theme without a rule searches its
// places / hotel assignments (the `themes` filter). Several ticked themes: a hotel must match each
// (their rules add up), pending Levent's choice between "both" and "either".
//
// Only what is SEARCHED changes (the committed `applied` filters); the sidebar keeps showing what
// the traveller ticked.
import { ruleParams } from './themeRule';

const NUMERIC = new Set(['themes', 'stars', 'facilities', 'accommodation', 'kids', 'segments']);
const UPPER = new Set(['boards', 'promos', 'roomFeatures']);

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
 * PURE. `filters` with the ticked themes' rules added. `rules`: Map id → rule (null = the theme
 * has no rule). A ticked theme not in `rules` (not loaded yet, or switched off) adds nothing.
 * Returns `filters` itself when nothing is added, so a commit without themes is unchanged.
 */
export function withHolidayThemes(filters, rules) {
  const ids = filters?.hthemes || [];
  if (!ids.length || !rules?.size) return filters;
  let out = null;
  const next = () => (out ||= { ...filters });
  for (const id of ids) {
    if (!rules.has(Number(id))) continue;
    const rule = rules.get(Number(id));
    if (!rule?.criteria?.length) { next().themes = union(next().themes, [Number(id)]); continue; }
    for (const [key, value] of ruleParams(rule.criteria, rule)) {
      if (key === 'show') continue;   // information only, never a filter
      const o = next();
      if (key === 'any') o.any = o.any ? `${o.any}|${value}` : value;
      else if (key === 'excludeAdultsOnly') o.excludeAdultsOnly = true;
      else if (key === 'adultsOnly') o.adultsOnly = true;
      else o[key] = union(o[key], valuesOf(key, value));
    }
  }
  return out || filters;
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
