// The default order and the result snapshot for Flight + Hotel (final contract, Ch 1 §2): the body
// asks the stable random order with the session seed; groups merge by the server's randomRank;
// "Show more" asks the groups that can still hold an earlier hotel; the count comes from the
// groups' snapshots only when every group has answered.
import { describe, it, expect } from 'vitest';
import { packageBody, mergePackages, groupsToExtend, randomOrder, packageTotal, cheapestPackage } from './packageResults';

const fp = { checkIn: '2026-11-13', checkOut: '2026-11-19', adults: '2', children: '0', rooms: '1' };
const p = (code, total, rank, o = {}) => ({ hotelCode: code, sunskyPayableTotal: total, randomRank: rank, ...o });
const codes = (l) => l.map((h) => h.hotelCode);

describe('the body', () => {
  it('recommended + a seed asks the random order with that seed', () => {
    const b = packageBody({ fp, filters: { sortBy: 'recommended' }, seed: 'abc123' });
    expect([b.sortBy, b.resultRandomSeed]).toEqual(['random', 'abc123']);
  });
  it('without a seed, and for the other sorts, no random order and no seed', () => {
    expect(packageBody({ fp, filters: { sortBy: 'recommended' } }).sortBy).toBeUndefined();
    expect(packageBody({ fp, filters: { sortBy: 'price_asc' }, seed: 's' })).not.toHaveProperty('resultRandomSeed');
    const desc = packageBody({ fp, filters: { sortBy: 'price_desc' }, seed: 's' });
    expect([desc.sortBy, desc.resultRandomSeed]).toEqual(['price_desc', undefined]);
    expect(packageBody({ fp, filters: { sortBy: 'name_asc' }, seed: 's' }).sortBy).toBeUndefined();
  });
});

describe('merging the groups', () => {
  it('recommended: by rank across groups, the unpriced last, duplicates once', () => {
    const groups = [
      { hotels: [p('a', 900, 10), p('c', 100, 30), p('u', 50, 1, { fromPriceEligible: false })] },
      { hotels: [p('b', 500, 20), p('a', 900, 10)] },
    ];
    expect(codes(mergePackages(groups, 'recommended'))).toEqual(['a', 'b', 'c', 'u']);
  });
  it('equal ranks fall back to the hotel code', () => {
    expect(codes([p('z', 1, 5), p('m', 2, 5)].sort(randomOrder))).toEqual(['m', 'z']);
  });
  it('an answer without ranks (an admin without the random order) keeps price order', () => {
    const groups = [{ hotels: [{ hotelCode: 'x', sunskyPayableTotal: 300 }, { hotelCode: 'y', sunskyPayableTotal: 100 }] }];
    expect(codes(mergePackages(groups, 'recommended'))).toEqual(['y', 'x']);
    const mixed = [{ hotels: [p('a', 300, 99)] }, { hotels: [{ hotelCode: 'b', sunskyPayableTotal: 100 }] }];
    expect(codes(mergePackages(mixed, 'recommended'))).toEqual(['b', 'a']);
  });
  it('price sorts ignore the rank', () => {
    const groups = [{ hotels: [p('a', 900, 1), p('b', 100, 2)] }];
    expect(codes(mergePackages(groups, 'price_asc'))).toEqual(['b', 'a']);
    expect(codes(mergePackages(groups, 'price_desc'))).toEqual(['a', 'b']);
  });
});

describe('show more', () => {
  it('recommended: only the groups whose loaded hotels end before the last one shown', () => {
    const g1 = { hasMore: true, hotels: [p('a', 1, 10), p('b', 1, 20)] };      // ends at 20
    const g2 = { hasMore: true, hotels: [p('c', 1, 30), p('d', 1, 90)] };      // ends at 90
    const g3 = { hasMore: false, hotels: [p('e', 1, 40)] };
    const groups = [g1, g2, g3];
    const merged = mergePackages(groups, 'recommended');                      // a b c e d
    // Showing 4 (a b c e): the cutoff ranks 40. g1 ends at 20 → may hold more before 40; g2 ends at 90 → no.
    expect(groupsToExtend(groups, merged, 4, 'recommended')).toEqual([g1]);
  });
  it('a group whose last hotel is unpriced cannot hold a priced one before the cutoff', () => {
    const g1 = { hasMore: true, hotels: [p('a', 1, 1, { fromPriceEligible: false })] };
    const g2 = { hasMore: false, hotels: [p('b', 1, 50)] };
    expect(groupsToExtend([g1, g2], mergePackages([g1, g2], 'recommended'), 1, 'recommended')).toEqual([]);
  });
});

describe('the count and the cheapest badge', () => {
  it('the snapshot total once every group answered; else not known', () => {
    expect(packageTotal([{ done: true, count: 3 }, { done: true, count: 4 }])).toBe(7);
    expect(packageTotal([{ done: true, count: 3 }, { done: false }])).toBeNull();
    expect(packageTotal([{ done: true, count: 3 }, { done: true, error: new Error('x'), count: 2 }])).toBeNull();
    expect(packageTotal([{ done: true }])).toBeNull();
    expect(packageTotal([])).toBeNull();
    expect(packageTotal([{ done: true, count: 0 }])).toBe(0);
  });
  it('the cheapest with an automatic from-price, whatever the order', () => {
    expect(cheapestPackage([p('a', 500, 1), p('b', 200, 2), p('c', 100, 3, { fromPriceEligible: false })]).hotelCode).toBe('b');
    expect(cheapestPackage([])).toBeNull();
  });
});
