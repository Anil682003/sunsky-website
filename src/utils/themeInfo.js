// Informational amenities of a theme (Theme Holiday doc §3 / §9): exact Hotelbeds pairs
// "facilityGroupCode:facilityCode" the theme NAMES on a hotel's card when the hotel has them.
// Never a filter: they arrive as `?show=`, which no search, count or cache request reads.

const PAIR = /^\d{1,4}:\d{1,6}$/;
export const MAX_SHOW = 6;

/** PURE. `?show=70:574,73:620` → the valid pairs, each once, at most MAX_SHOW. */
export function showPairs(raw) {
  const out = [];
  for (const p of String(raw ?? '').split(',').map((s) => s.trim())) {
    if (PAIR.test(p) && !out.includes(p)) out.push(p);
    if (out.length >= MAX_SHOW) break;
  }
  return out;
}

/** PURE. The names of the pairs this hotel has, in the theme's order (its own facility list). */
export function themeAmenities(facilities, pairs) {
  if (!pairs?.length || !Array.isArray(facilities)) return [];
  const byPair = new Map();
  for (const f of facilities) {
    const key = `${f?.facilityGroupCode}:${f?.facilityCode}`;
    const name = String(f?.facilityName || '').trim();
    if (name && !byPair.has(key)) byPair.set(key, name);
  }
  const names = [];
  for (const p of pairs) {
    const n = byPair.get(p);
    if (n && !names.includes(n)) names.push(n);
  }
  return names;
}
