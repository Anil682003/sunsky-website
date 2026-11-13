// The value-added extras of a price (VALUE_ADDED, SunSkyCache `extras`): their names, for the
// results card. Strings only, trimmed, each once, at most 3 — or null when there are none.
export function extrasOf(list) {
  if (!Array.isArray(list)) return null;
  const out = [...new Set(list.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))].slice(0, 3);
  return out.length ? out : null;
}
