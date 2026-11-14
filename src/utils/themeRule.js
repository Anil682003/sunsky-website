// A theme's feature rule as search parameters (Theme Holiday, Nov 2026). The rule is set in the
// dashboard on a Holiday Type, or on a homepage card, as
//   { criteria: [{ filterKey, value, label }], match: 'all'|'any', excludeAdultsOnly }
// and reaches the results page the same way from a homepage card and from the Holiday Types page.
//
//   Match all → one parameter per filter (values of one filter OR together, like the sidebar)
//   Match N or more (`match: 'min', min: N`, doc §2) → the same `any` group, marked `minN!`:
//               `any=min2!kids:340;kids:385;activities:73:350` — at least N of its criteria
//   OR between groups (`join: 'or'` on a group) → the groups in one `any` part, `~` between them:
//               `any=segments:81~min2!kids:340;kids:350;kids:385` (Family: segment OR 2 of 3)
//   Match any → content criteria in one `any=key:value;key:value` group; board and offers stay
//               normal filters, because they are matched on the priced rate, not the hotel record
//   Offers    → `promos=EARLY_BOOKING` (the results page's offers filter, sent on as `offers`)
//   Room facilities → `roomFeatures=PRIVATE_POOL` (the priced room must have it; always required)
//   excludeAdultsOnly → `excludeAdultsOnly=1`

/** Matched on the priced rate, so always required — never part of a Match any group. */
const ON_PRICE = new Set(['boards', 'promos', 'roomFeatures']);

/**
 * [[name, value], …] for the rule, or [] when nothing in it is usable.
 *
 * `groups` (mixed rules, doc §2 / §8): further groups the hotel must ALSO meet. A Match all group
 * adds its filters like the first; each Match any group becomes one more `any` group, separated
 * by "|" (the admin ANDs the groups, ORs inside each).
 */
export function ruleParams(criteria, { match, min, excludeAdultsOnly, groups } = {}) {
  const byKey = new Map();
  const anyGroups = [];
  const all = [{ criteria, match, min }, ...(Array.isArray(groups) ? groups : [])];
  // Groups joined with OR (`join: 'or'`: this group OR the one before it) form one chain; chains
  // are ANDed. A chain of one is the group as before.
  const chains = [];
  all.forEach((g, i) => {
    if (i > 0 && g?.join === 'or' && chains.length) chains[chains.length - 1].push(g);
    else chains.push([g]);
  });
  for (const chain of chains) {
    const alts = chain.map((g) => groupTokens(g, byKey, chain.length > 1)).filter(Boolean);
    // "~" between whole groups: the hotel needs any one of them (doc §3 Family: segment OR 2 of 3).
    if (alts.length) anyGroups.push(alts.join('~'));
  }
  if (!byKey.size && !anyGroups.length) return [];
  const out = [...byKey].map(([key, values]) => [key, [...values].join(',')]);
  if (anyGroups.length) out.push(['any', anyGroups.join('|')]);
  if (excludeAdultsOnly) out.push(['excludeAdultsOnly', '1']);
  return out;
}

/**
 * One group's `any` text ("min2!kids:340;kids:350", "segments:81;kids:340"), or null when all its
 * criteria are plain AND filters (added to `byKey`). In an OR chain a Match all group cannot be
 * plain filters — it is written as "all N of N" (min N), which means the same.
 */
function groupTokens(g, byKey, inChain) {
  const grouped = g?.match === 'any' || g?.match === 'min';
  const allInChain = inChain && !grouped;
  const tokens = collect(g?.criteria, allInChain ? 'min' : g?.match, byKey);
  if (!tokens.length) return null;
  if (allInChain) return `min${tokens.length}!${tokens.join(';')}`;
  // MIN N: at least N of the group's content criteria (the admin caps N at their number).
  const n = Math.round(Number(g?.min));
  const mark = g?.match === 'min' ? `min${Number.isFinite(n) && n >= 1 ? n : 1}!` : '';
  return mark + tokens.join(';');
}

/** One group: its AND filters into `byKey`; returns its Match any / MIN N tokens. */
function collect(criteria, match, byKey) {
  const anyTokens = [];
  const grouped = match === 'any' || match === 'min';
  for (const c of Array.isArray(criteria) ? criteria : []) {
    const key = String(c?.filterKey || '').trim();
    if (!key) continue;
    // adultsOnly is the one boolean dimension; the results page reads it as `?adultsOnly=1`.
    if (key === 'adultsOnly') {
      if (!c.value) continue;
      if (grouped) anyTokens.push('adultsOnly:1'); else byKey.set(key, new Set(['1']));
      continue;
    }
    const value = String(c?.value ?? '').trim();
    if (!value) continue;
    if (grouped && !ON_PRICE.has(key)) { anyTokens.push(`${key}:${value}`); continue; }
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key).add(value);
  }
  return anyTokens;
}

/**
 * `href` (a /results link) with a Holiday Type's rule added on top of what it already searches —
 * the type's places stay, the rule narrows within them. A filter the link already carries gets
 * the rule's values added to it. No rule → the link unchanged.
 */
export function withThemeRule(href, rule) {
  if (!href || !String(href).startsWith('/results') || !rule?.criteria?.length) return href;
  const params = ruleParams(rule.criteria, rule);
  if (!params.length) return href;
  const i = href.indexOf('?');
  const path = i < 0 ? href : href.slice(0, i);
  const qs = new URLSearchParams(i < 0 ? '' : href.slice(i + 1));
  for (const [k, v] of params) {
    const have = k === 'any' || k === 'excludeAdultsOnly' ? '' : qs.get(k);
    qs.set(k, have ? [...new Set([...have.split(','), ...v.split(',')])].join(',') : v);
  }
  return `${path}?${qs.toString()}`;
}
