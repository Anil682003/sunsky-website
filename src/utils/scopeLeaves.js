// scopeLeaves.js — what a search scope actually covers.
//
// A scope is three tiers of the same cascade: { countries, destinations, zones }. The tiers
// OVERLAP by construction — ticking Antalya keeps Turkey ticked, and ticking the area "Side"
// keeps Antalya ticked — so summing them double-bills one narrowed search as several places
// ("Turkey + Antalya" read as 2, "Antalya + Side" as 2).
//
// The honest unit is the LEAF: the deepest thing ticked on each branch is what gets searched,
// and an ancestor only counts when nothing below it was picked (Spain with no city = all of
// Spain). Both the picker's badge and the results hero label count the same way from here.

// zoneCode is unique only inside a destination, so a picked area is keyed by both: "AYT:16".
export const zoneKey  = (z) => `${z.destinationCode}:${z.zoneCode}`;
export const zoneCity = (key) => String(key).split(':')[0];

/**
 * The leaves of a scope, tier by tier.
 *
 * @param {{countries?:string[], destinations?:string[], zones?:string[]}} scope
 * @param {{code:string, countryCode:string}[]} cities city → country lookup (the cascade's
 *   level-2 list). A city missing from it can't narrow its country, so the country still
 *   counts — a conservative fall back to today's behaviour while the list is loading.
 * @returns {{countries:string[], destinations:string[], zones:string[]}}
 */
export function scopeLeaves({ countries = [], destinations = [], zones = [] } = {}, cities = []) {
  const zoned = new Set(zones.map(zoneCity));
  const cityCountry = new Map((cities || []).map((c) => [c.code, c.countryCode]));
  const narrowed = new Set();
  for (const code of destinations) {
    const cc = cityCountry.get(code);
    if (cc) narrowed.add(cc);
  }
  return {
    countries:    countries.filter((c) => !narrowed.has(c)),
    destinations: destinations.filter((d) => !zoned.has(d)),
    zones:        [...zones],
  };
}

/** How many places a scope covers. */
export function scopeLeafCount(scope, cities) {
  const l = scopeLeaves(scope, cities);
  return l.countries.length + l.destinations.length + l.zones.length;
}
