import { describe, it, expect } from 'vitest';
import { orderCountries, byPopularThenName, rankOf } from './countryOrder';

/**
 * The picker's rail was plain alphabetical, so Albania, Aruba, Barbados and Bonaire led while
 * Spain, Turkey and Greece sat below the fold. The dashboard now marks countries popular and
 * ranks them (GeoData → Countries), and this is the order that comes out.
 */
const C = (name, popular, popularOrder) => ({ id: name, name, ...(popular ? { popular } : {}), ...(popularOrder != null ? { popularOrder } : {}) });

describe('orderCountries', () => {
  it('leads with the popular ones in the rank the dashboard set', () => {
    const { list } = orderCountries([
      C('Albania'), C('Spain', true, 2), C('Zimbabwe'), C('Turkey', true, 1),
    ]);
    expect(list.map((c) => c.name)).toEqual(['Turkey', 'Spain', 'Albania', 'Zimbabwe']);
  });

  it('puts a popular country with no rank after the ranked ones, not ahead of them', () => {
    const { list } = orderCountries([
      C('Greece', true), C('Turkey', true, 1), C('Albania'),
    ]);
    expect(list.map((c) => c.name)).toEqual(['Turkey', 'Greece', 'Albania']);
  });

  it('keeps the rest alphabetical underneath', () => {
    const { list } = orderCountries([C('Zimbabwe'), C('Albania'), C('Turkey', true, 1)]);
    expect(list.map((c) => c.name)).toEqual(['Turkey', 'Albania', 'Zimbabwe']);
  });

  it('counts the popular block so the rail can rule a line under it', () => {
    expect(orderCountries([C('Turkey', true, 1), C('Spain', true, 2), C('Albania')]).popularCount).toBe(2);
  });

  it('marks no block when nothing is popular, or when everything is', () => {
    // A heading over the whole list labels nothing.
    expect(orderCountries([C('Albania'), C('Spain')]).popularCount).toBe(0);
    expect(orderCountries([C('Turkey', true, 1), C('Spain', true, 2)]).popularCount).toBe(0);
  });

  it('treats a rank that is not a rank as unranked rather than as zero', () => {
    const { list } = orderCountries([
      C('B', true, 'nonsense'), C('A', true, 1), C('C', true, 0),
    ]);
    // 0 and 'nonsense' are both "no rank", so they fall behind the ranked one and sort by name.
    expect(list.map((c) => c.name)).toEqual(['A', 'B', 'C']);
  });

  it('survives junk instead of taking the picker down with it', () => {
    expect(() => orderCountries(null)).not.toThrow();
    expect(() => orderCountries([null, undefined, C('A')])).not.toThrow();
    expect(orderCountries([null, C('A')]).list.map((c) => c.name)).toEqual(['A']);
    expect(() => [undefined, null, {}].sort(byPopularThenName)).not.toThrow();
  });

  it('rankOf accepts a whole number from 1 up and nothing else', () => {
    expect(rankOf(1)).toBe(1);
    expect(rankOf('3')).toBe(3);
    for (const junk of [0, -1, 1.5, '', null, undefined, 'first']) expect(rankOf(junk)).toBeNull();
  });
});
