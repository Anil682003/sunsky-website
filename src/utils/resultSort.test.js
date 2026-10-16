import { describe, it, expect } from 'vitest';
import { sortHotels, comparatorFor, starsOf, distanceOf, nameOf, compareCodes } from './resultSort';

const hotel = (hotelCode, extra = {}) => ({ hotelCode, ...extra });
const codes = (list) => list.map((h) => String(h.hotelCode));

describe('unknown values sort last, in both directions', () => {
  // The bug this replaces: missing stars were coerced to 0, so "Stars: 1 to 5" opened with
  // every hotel whose rating had not loaded, which reads as a list of bad hotels.
  const info = { 1: { stars: 3 }, 2: {}, 3: { stars: 5 }, 4: { stars: null } };
  const list = [hotel(1), hotel(2), hotel(3), hotel(4)];

  it('stars, low to high: rated hotels first, unrated after them', () => {
    expect(codes(sortHotels(list, 'stars_asc', { info }))).toEqual(['1', '3', '2', '4']);
  });

  it('stars, high to low: still rated first, the unrated do not jump to the top', () => {
    expect(codes(sortHotels(list, 'stars_desc', { info }))).toEqual(['3', '1', '2', '4']);
  });

  it('names that have not loaded sort last either way', () => {
    const named = { 1: { name: 'Zeus' }, 2: { name: 'Alfa' }, 3: {} };
    const rows = [hotel(1), hotel(2), hotel(3)];
    expect(codes(sortHotels(rows, 'name_asc', { info: named }))).toEqual(['2', '1', '3']);
    expect(codes(sortHotels(rows, 'name_desc', { info: named }))).toEqual(['1', '2', '3']);
  });

  it('hotels with no distance sort after every hotel that has one', () => {
    const attrs = { 1: { beachMetres: 900 }, 2: {}, 3: { beachMetres: 50 } };
    expect(codes(sortHotels([hotel(1), hotel(2), hotel(3)], 'distance_beach', { attrs })))
      .toEqual(['3', '1', '2']);
  });
});

describe('ties are stable', () => {
  it('equal stars come out in the same order whatever order they went in', () => {
    const info = { 10: { stars: 4 }, 20: { stars: 4 }, 30: { stars: 4 } };
    const forward = sortHotels([hotel(10), hotel(20), hotel(30)], 'stars_desc', { info });
    const shuffled = sortHotels([hotel(30), hotel(10), hotel(20)], 'stars_desc', { info });
    expect(codes(forward)).toEqual(['10', '20', '30']);
    expect(codes(shuffled)).toEqual(codes(forward));
  });

  it('two unknown distances have a defined order rather than NaN', () => {
    // Infinity - Infinity is NaN, and a comparator returning NaN leaves the order of that
    // group up to the engine. These rows must come out the same way every time.
    const attrs = { 5: { beachMetres: 100 } };
    const a = sortHotels([hotel(7), hotel(9), hotel(5)], 'distance_beach', { attrs });
    const b = sortHotels([hotel(9), hotel(7), hotel(5)], 'distance_beach', { attrs });
    expect(codes(a)).toEqual(['5', '7', '9']);
    expect(codes(b)).toEqual(codes(a));
  });

  it('hotel codes break ties as numbers, so 9 comes before 10', () => {
    const info = { 9: { stars: 4 }, 10: { stars: 4 } };
    expect(codes(sortHotels([hotel(10), hotel(9)], 'stars_asc', { info }))).toEqual(['9', '10']);
    expect(compareCodes(hotel(9), hotel(10))).toBeLessThan(0);
  });

  it('non-numeric codes still have a definite order', () => {
    expect(compareCodes(hotel('W2M-B'), hotel('W2M-A'))).toBeGreaterThan(0);
    expect(compareCodes(hotel('X'), hotel('X'))).toBe(0);
  });
});

describe('the values themselves', () => {
  it('reads stars from info first, then attributes, then the row', () => {
    expect(starsOf(hotel(1), { info: { 1: { stars: 5 } }, attrs: { 1: { stars: 3 } } })).toBe(5);
    expect(starsOf(hotel(1), { attrs: { 1: { stars: 3 } } })).toBe(3);
    expect(starsOf(hotel(1, { stars: 2 }))).toBe(2);
  });

  it('treats zero stars as unknown, not as the worst rating', () => {
    // Nothing in today's payload separates "unrated" from "rated zero". Calling an unrated
    // hotel zero-star is a claim about its quality; leaving it out of the ranking is not.
    expect(starsOf(hotel(1), { info: { 1: { stars: 0 } } })).toBeNull();
    expect(starsOf(hotel(1), { info: { 1: { stars: '' } } })).toBeNull();
    expect(starsOf(hotel(1), { info: { 1: {} } })).toBeNull();
  });

  it('keeps zero metres, because beachfront is a real distance', () => {
    expect(distanceOf(hotel(1), 'beachMetres', { attrs: { 1: { beachMetres: 0 } } })).toBe(0);
    expect(distanceOf(hotel(1), 'beachMetres', { attrs: { 1: { beachMetres: -1 } } })).toBeNull();
    expect(distanceOf(hotel(1), 'beachMetres', { attrs: {} })).toBeNull();
  });

  it('treats a blank or whitespace name as not loaded', () => {
    expect(nameOf(hotel(1), { info: { 1: { name: '  ' } } })).toBeNull();
    expect(nameOf(hotel(1, { name: 'Fallback' }))).toBe('Fallback');
  });

  it('files accented names with their plain letter', () => {
    const info = { 1: { name: 'Zeus' }, 2: { name: 'Örnek' } };
    expect(codes(sortHotels([hotel(1), hotel(2)], 'name_asc', { info }))).toEqual(['2', '1']);
  });
});

describe('sorts the cache already did', () => {
  it('leaves price and the default listing untouched, and keeps the same array', () => {
    const list = [hotel(3), hotel(1), hotel(2)];
    for (const sortBy of ['price_asc', 'price_desc', 'recommended', undefined]) {
      expect(sortHotels(list, sortBy)).toBe(list);
      expect(comparatorFor(sortBy)).toBeNull();
    }
  });

  it('does not copy a list too short to reorder', () => {
    const one = [hotel(1)];
    expect(sortHotels(one, 'stars_asc')).toBe(one);
    expect(sortHotels([], 'stars_asc')).toEqual([]);
  });

  it('never mutates the list it was given', () => {
    const list = [hotel(3), hotel(1)];
    sortHotels(list, 'stars_asc', { info: { 1: { stars: 5 }, 3: { stars: 2 } } });
    expect(codes(list)).toEqual(['3', '1']);
  });
});
