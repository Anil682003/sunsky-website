/**
 * The client-side result sorts: name, stars and distance (Ch2 §4, Ch3 §5, UI-17).
 *
 * Price sorts are the cache's job. These three reorder what is already loaded, using hotel
 * content that streams in afterwards, which is what makes them fiddly: the value a row sorts on
 * is often not there yet.
 *
 * Two rules decide everything here.
 *
 * UNKNOWN IS NOT A VALUE. A hotel whose stars, distance or name have not arrived (or that has
 * none) sorts AFTER every hotel that has one, in BOTH directions. The old code coerced missing
 * stars to 0, so "Stars: 1 to 5" opened with every unclassified hotel, which reads as a list of
 * bad hotels. Sorting them last in both directions is the only arrangement that never makes an
 * absent value look like a low one.
 *
 * TIES BREAK ON THE HOTEL CODE. Without it, equal values fall back to the order the rows arrived
 * in, and that order is not stable: the default listing is randomised per session and "Show more"
 * appends pages. The same search could then show two equal-star hotels in a different order on
 * every reload. The old stars sort broke ties on name instead, which looks nicer but reshuffles
 * the list as names stream in, so the ordering moved under the traveller's cursor.
 */

/** A finite number, or null when the value cannot be trusted. `min` rejects sentinel zeroes. */
const numberOr = (value, { min = -Infinity } = {}) => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : null;
};

/**
 * A hotel's star rating, or null when it is unknown.
 *
 * Zero counts as unknown rather than as "no stars": nothing in the current payload tells the two
 * apart, and the cost of guessing wrong is asymmetric — calling an unrated hotel zero-star is a
 * statement about its quality, while leaving it out of the ranking is not. UI-23 adds a
 * `classification` field that separates "positively unclassified" from "we do not know", and
 * this is where that distinction belongs once it exists.
 */
export const starsOf = (hotel, { info = {}, attrs = {} } = {}) => {
  const code = String(hotel?.hotelCode ?? '');
  return numberOr(info[code]?.stars ?? attrs[code]?.stars ?? hotel?.stars, { min: 1 });
};

/** Metres to the beach or the centre, or null when unknown. Zero is a real distance. */
export const distanceOf = (hotel, field, { attrs = {} } = {}) =>
  numberOr(attrs[String(hotel?.hotelCode ?? '')]?.[field], { min: 0 });

/** The display name, or null while it is still loading. */
export const nameOf = (hotel, { info = {} } = {}) => {
  const name = (info[String(hotel?.hotelCode ?? '')]?.name || hotel?.name || '').trim();
  return name || null;
};

/**
 * Hotel codes are numeric at both suppliers, so compare them as numbers when possible: as
 * strings, hotel 10 would sort before hotel 9 and the tie-break would look like a shuffle.
 */
export const compareCodes = (a, b) => {
  const ca = String(a?.hotelCode ?? '');
  const cb = String(b?.hotelCode ?? '');
  const na = Number(ca);
  const nb = Number(cb);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return ca < cb ? -1 : ca > cb ? 1 : 0;
};

/**
 * Compare on `valueOf`, unknown last in both directions, ties broken on the hotel code.
 *
 * `dir` only ever applies to two known values. Applying it to the unknown branch is the mistake
 * that puts missing values first when the sort is reversed.
 */
export const byValue = (valueOf, dir, compare) => (a, b) => {
  const va = valueOf(a);
  const vb = valueOf(b);

  if (va === null || vb === null) {
    if (va === null && vb === null) return compareCodes(a, b);
    return va === null ? 1 : -1;
  }

  const diff = compare(va, vb);
  return diff !== 0 ? dir * diff : compareCodes(a, b);
};

const compareNumbers = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Locale-aware, case- and accent-insensitive, so "Ö" files with "O" rather than after "Z". */
const compareNames = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });

/**
 * The comparator for a sort option, or null when the cache already ordered the list
 * (price sorts and the default listing), in which case the loaded order is kept as it is.
 */
export const comparatorFor = (sortBy, maps = {}) => {
  switch (sortBy) {
    case 'stars_asc':
      return byValue((h) => starsOf(h, maps), 1, compareNumbers);
    case 'stars_desc':
      return byValue((h) => starsOf(h, maps), -1, compareNumbers);
    case 'name_asc':
      return byValue((h) => nameOf(h, maps), 1, compareNames);
    case 'name_desc':
      return byValue((h) => nameOf(h, maps), -1, compareNames);
    // Nearest first is the only direction offered for either distance.
    case 'distance_beach':
      return byValue((h) => distanceOf(h, 'beachMetres', maps), 1, compareNumbers);
    case 'distance_centre':
      return byValue((h) => distanceOf(h, 'centreMetres', maps), 1, compareNumbers);
    default:
      return null;
  }
};

/**
 * Sort the loaded results. Returns the list unchanged (same reference) when the sort belongs to
 * the cache, so React sees no new array and nothing re-renders for nothing.
 */
export const sortHotels = (hotels, sortBy, maps = {}) => {
  const comparator = comparatorFor(sortBy, maps);
  if (!comparator || !Array.isArray(hotels) || hotels.length < 2) return hotels;
  return [...hotels].sort(comparator);
};

export default sortHotels;
