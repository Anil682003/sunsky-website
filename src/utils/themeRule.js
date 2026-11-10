// A theme's feature rule as search parameters (Theme Holiday, Nov 2026). The rule is set in the
// dashboard on a Holiday Type, or on a homepage card, as
//   { criteria: [{ filterKey, value, label }], match: 'all'|'any', excludeAdultsOnly }
// and reaches the results page the same way from a homepage card and from the Holiday Types page.
//
//   Match all → one parameter per filter (values of one filter OR together, like the sidebar)
//   Match any → content criteria in one `any=key:value;key:value` group; board stays a normal
//               filter, because it is matched on the priced rate, not the hotel record
//   excludeAdultsOnly → `excludeAdultsOnly=1`

/** [[name, value], …] for the rule, or [] when nothing in it is usable. */
export function ruleParams(criteria, { match, excludeAdultsOnly } = {}) {
  const byKey = new Map();
  const anyTokens = [];
  for (const c of Array.isArray(criteria) ? criteria : []) {
    const key = String(c?.filterKey || '').trim();
    if (!key) continue;
    // adultsOnly is the one boolean dimension; the results page reads it as `?adultsOnly=1`.
    if (key === 'adultsOnly') {
      if (!c.value) continue;
      if (match === 'any') anyTokens.push('adultsOnly:1'); else byKey.set(key, new Set(['1']));
      continue;
    }
    const value = String(c?.value ?? '').trim();
    if (!value) continue;
    if (match === 'any' && key !== 'boards') { anyTokens.push(`${key}:${value}`); continue; }
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key).add(value);
  }
  if (!byKey.size && !anyTokens.length) return [];
  const out = [...byKey].map(([key, values]) => [key, [...values].join(',')]);
  if (anyTokens.length) out.push(['any', anyTokens.join(';')]);
  if (excludeAdultsOnly) out.push(['excludeAdultsOnly', '1']);
  return out;
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
