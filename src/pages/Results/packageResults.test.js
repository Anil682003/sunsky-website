// "Incl. flight" results from the package search (7 Oct 2026): the request body, the merge of
// groups answered one by one, paging across groups, and the destinations that cannot be
// calculated yet.
import { describe, it, expect } from 'vitest';
import {
  packageBody, chunkDestinations, mapPackage, mergePackages, groupsToExtend, unknownDestinations, mergeBoardFacets, PRECALC_NIGHTS,
} from './packageResults';

const fp = { checkIn: '2026-11-13', checkOut: '2026-11-19', adults: '2', children: '1', rooms: '1', childAges: '8' };

describe('the request body', () => {
  it('a dated search: that departure date (± flex), the trip length in days, the page\'s filters', () => {
    const b = packageBody({
      fp, origins: ['BRU', 'CRL'], hotelCodes: ['1', '2'], flex: 0,
      filters: { boards: ['AI'], roomTypes: ['DBL'], refundable: 'yes', minPrice: '300', maxPrice: '900', priceBasis: 'perPerson', sortBy: 'price_desc', nonstop: true, arrivals: ['SAW'] },
    });
    expect(b).toMatchObject({
      from: '2026-11-13', to: '2026-11-13', travelDays: '7', adults: '2', children: '1', childAges: '8', rooms: '1',
      origins: 'BRU,CRL', arrivals: 'SAW', routing: 'nonstop', hotelCodes: ['1', '2'], boards: ['AI'], roomTypes: ['DBL'],
      refundable: 'yes', minPrice: 300, maxPrice: 900, priceBasis: 'perPerson', sortBy: 'price_desc',
    });
    expect(b.nights).toBeUndefined();
    expect(packageBody({ fp, flex: 2 })).toMatchObject({ from: '2026-11-11', to: '2026-11-15' });
  });

  it('a search without dates of its own asks exactly the precalculated default', () => {
    const b = packageBody({ fp: { ...fp, children: '0', childAges: '' }, dated: false });
    expect(b).toMatchObject({ nights: PRECALC_NIGHTS, adults: '2', children: '0', rooms: '1' });
    for (const k of ['from', 'to', 'travelDays', 'origins', 'boards', 'hotelCodes', 'routing', 'sortBy', 'childAges']) expect(b[k]).toBeUndefined();
  });

  it('a band without 7 nights asks its own lengths', () => {
    expect(packageBody({ fp, dated: false, bandNights: [10, 11, 12, 13, 14] }).nights).toBe('10,11,12,13,14');
    expect(packageBody({ fp, dated: false, bandNights: [5, 6, 7, 8, 9] }).nights).toBe(PRECALC_NIGHTS);
  });

  it('defaults and bad values drop out; an empty content filter stays (it means "nothing matched")', () => {
    const b = packageBody({ fp, hotelCodes: [], filters: { refundable: 'any', minPrice: '', maxPrice: '100', priceBasis: 'total', sortBy: 'price_asc' } });
    expect(b.hotelCodes).toEqual([]);
    expect(b.maxPrice).toBe(100);
    for (const k of ['refundable', 'minPrice', 'priceBasis', 'sortBy']) expect(b[k]).toBeUndefined();
    expect(packageBody({ fp, filters: { minPrice: '500', maxPrice: '100' } }).maxPrice).toBeUndefined();   // max below min
  });
});

describe('groups', () => {
  it('destinations in groups of 4', () => {
    expect(chunkDestinations(['A', 'B', 'C', 'D', 'E'])).toEqual([['A', 'B', 'C', 'D'], ['E']]);
    expect(chunkDestinations([])).toEqual([]);
  });

  const p = (code, total) => ({ hotelCode: code, sunskyPayableTotal: total });
  it('answers merged into one sorted list; a hotel in two groups once', () => {
    const groups = [{ hotels: [p('a', 500), p('c', 900)] }, { hotels: [p('b', 600), p('a', 500)] }];
    expect(mergePackages(groups).map((h) => h.hotelCode)).toEqual(['a', 'b', 'c']);
    expect(mergePackages(groups, 'price_desc').map((h) => h.hotelCode)).toEqual(['c', 'b', 'a']);
  });

  it('"Show more" asks the next page only of groups that could hold a cheaper package', () => {
    const g1 = { hotels: [p('a', 100), p('b', 200)], hasMore: true };     // its next page is ≥ 200
    const g2 = { hotels: [p('c', 150), p('d', 900)], hasMore: true };     // next page ≥ 900: not needed
    const g3 = { hotels: [p('e', 300)], hasMore: false };
    const merged = mergePackages([g1, g2, g3]);
    expect(groupsToExtend([g1, g2, g3], merged, 4)).toEqual([g1]);         // 4th shown = 300
    expect(groupsToExtend([g1, g2, g3], merged, 10)).toEqual([g1, g2]);    // past the end: every group with more
  });

  it('destinations that cannot be calculated yet, and the board facets of all groups', () => {
    const groups = [
      { destinationStatus: { AYT: { status: 'FEASIBLE' }, ADB: { status: 'UNKNOWN', reason: 'NO_RETURN_FARES' } }, boardFacets: { AI: 3 } },
      { destinationStatus: { BER: { status: 'NOT_FEASIBLE' } }, boardFacets: { AI: 1, HB: 2 } },
    ];
    expect(unknownDestinations(groups)).toEqual(['ADB']);
    expect(mergeBoardFacets(groups)).toEqual({ AI: 4, HB: 2 });
  });
});

describe('a package as a card', () => {
  it('carries the package and its rounded prices; no name (never the code)', () => {
    const pkg = { hotelCode: '7', destination: 'AYT', sunskyPayableTotal: 1100.4, sunskyPayableTotalRounded: 1101, pricePerPerson: 551, board: 'AI', room: 'DBL', currency: 'EUR' };
    const c = mapPackage(pkg, 'Antalya');
    expect(c).toMatchObject({ hotelCode: '7', name: null, totalAmount: 1101, totalAmountUnrounded: 1100.4, perPerson: 551, boardCode: 'AI', roomType: 'DBL', loc: 'Antalya', destinationCode: 'AYT', pkg });
  });
});
