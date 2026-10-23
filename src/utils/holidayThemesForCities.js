/**
 * The holiday-type themes that follow the cities a traveller picks (Levent 23 Oct 2026).
 *
 * A search entered as "Zonvakanties in Greece" carries the Zonvakanties theme. Picking Athens,
 * which is a city trip, must not leave Zonvakanties ticked (no Athens hotel is a sun holiday, so
 * the page would come back empty): the holiday types become those of the picked cities, so
 * Athens → Stedentrips, and Athens + Rhodes → Stedentrips and Zonvakanties.
 *
 * Only holiday types that have places (`placesByType`: type id → destination codes) take part;
 * every other ticked theme (Adults Only, Family…) is kept as it is. Nothing changes when no
 * holiday type is ticked (the traveller is not searching by type), when no city is picked (a
 * country alone says nothing about the type), or when none of the picked cities has a type.
 *
 * @param {{ destinations?: string[], zones?: string[] }} picked  zones as "DEST:ZONE"
 * @param {Array<string|number>} themes                            the ticked themes
 * @param {Map<string, Set<string>>|null} placesByType             type id → destinations
 * @returns {string[]|null}  the new themes, or null for "leave them as they are"
 */
export function holidayThemesForCities(picked, themes, placesByType) {
  if (!placesByType?.size) return null;
  const ticked = (themes || []).map(String);
  if (!ticked.some((id) => placesByType.has(id))) return null;
  const cities = new Set([
    ...(picked?.destinations || []).map((d) => String(d).toUpperCase()),
    ...(picked?.zones || []).map((z) => String(z).split(':')[0].toUpperCase()),
  ]);
  if (!cities.size) return null;
  const types = [...placesByType].filter(([, places]) => [...cities].some((c) => places.has(c))).map(([id]) => id);
  if (!types.length) return null;
  const others = ticked.filter((id) => !placesByType.has(id));
  return [...others, ...types];
}
