// "Incl. flight" results from the package search (7 Oct 2026): the request body, the merge of
// groups answered one by one, paging across groups, and the destinations that cannot be
// calculated yet.
import { describe, it, expect } from 'vitest';
import {
  packageBody, chunkDestinations, mapPackage, mergePackages, groupsToExtend, unknownDestinations, mergeBoardFacets,
  mergeDestinationCounts, mergeAirportFacets, PRECALC_NIGHTS, PACKAGE_WINDOW_DAYS,
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

describe('the airports the package answers prove (Ch 1 §9A)', () => {
  const g = (facets, o = {}) => ({ done: true, error: null, airportFacets: facets, ...o });
  const f = (origins, arrivals, complete = true) => ({ origins, arrivals, complete });

  it('complete answers: the union of the airports with at least one hotel', () => {
    const r = mergeAirportFacets([g(f({ BRU: 3, LGG: 0 }, { AYT: 3 })), g(f({ AMS: 1 }, { DLM: 1 }))]);
    expect([...r.origins].sort()).toEqual(['AMS', 'BRU']);
    expect([...r.arrivals].sort()).toEqual(['AYT', 'DLM']);
  });

  it('nothing proven while a group loads or failed, or when an answer is incomplete or has no facets', () => {
    const none = { origins: null, arrivals: null };
    expect(mergeAirportFacets([g(f({ BRU: 1 }, {})), g(null, { done: false })])).toEqual(none);
    expect(mergeAirportFacets([g(f({ BRU: 1 }, {})), g(null, { error: new Error('x') })])).toEqual(none);
    expect(mergeAirportFacets([g(f({ BRU: 1 }, {}, false))])).toEqual(none);
    expect(mergeAirportFacets([g(undefined)])).toEqual(none);
    expect(mergeAirportFacets([])).toEqual(none);
  });

  it('a search that chose airports proves nothing about the others on that side', () => {
    const r = mergeAirportFacets([g(f({ BRU: 2 }, { AYT: 2 }))], { origins: 'BRU' });
    expect(r.origins).toBeNull();
    expect([...r.arrivals]).toEqual(['AYT']);
    expect(mergeAirportFacets([g(f({ BRU: 2 }, { AYT: 2 }))], { arrivals: 'AYT' }).arrivals).toBeNull();
  });
});

/**
 * UI-10 (Ch 1 §10, Ch 2 case 19, Ch 3 case 13). An automatic from-price needs a trip of at least
 * 3 travel days for a city trip and 5 for anything else. A hotel whose only complete packages are
 * shorter keeps its place in the list and offers its available dates instead of a price.
 *
 * Quoting the short trip would be the real failure: a two-night package advertised as the price
 * of a holiday, with the traveller finding out at the hotel page that it buys a different trip.
 */
describe('mapPackage carries why a hotel has no from-price (UI-10)', () => {
  const base = { hotelCode: 'H1', destination: 'AYT', sunskyPayableTotal: 1100, pricePerPerson: 550 };

  it('flags a hotel the from-price rule excluded, with the minimum it fell short of', () => {
    const card = mapPackage({ ...base, fromPriceEligible: false, commercialMinDays: 5 }, 'Antalya');
    expect(card.noFromPrice).toBe(true);
    expect(card.minTravelDays).toBe(5);
  });

  it('a priced hotel is not flagged', () => {
    const card = mapPackage({ ...base, fromPriceEligible: true, commercialMinDays: 5 }, 'Antalya');
    expect(card.noFromPrice).toBe(false);
    expect(card.totalAmount).toBe(1100);
  });

  it('an answer that says nothing about eligibility is treated as priced', () => {
    // Only an explicit `false` withholds the price. Reading a missing field as "not eligible"
    // would blank the price on every hotel the moment the API stopped sending it.
    expect(mapPackage(base, 'Antalya').noFromPrice).toBe(false);
    expect(mapPackage({ ...base, fromPriceEligible: undefined }, 'Antalya').noFromPrice).toBe(false);
  });

  it('a missing minimum is null rather than zero, so nothing claims "at least 0 days"', () => {
    expect(mapPackage({ ...base, fromPriceEligible: false }, 'Antalya').minTravelDays).toBeNull();
  });
});

/**
 * Hotels per destination in the scope filter (UI-13, Ch 1 §5).
 *
 * The page asks per destination group, so a number can only be printed once every group has
 * answered and said its answer is complete. A count that is still settling, shown as if final,
 * is a wrong number rather than a missing one.
 */
describe('mergeDestinationCounts', () => {
  const g = (dests, counts, extra = {}) => ({
    dests, done: true, error: null,
    destinationFacets: { counts, complete: true },
    ...extra,
  });

  it('sums the groups, each covering its own destinations', () => {
    expect(mergeDestinationCounts([
      g(['AYT'], { AYT: 624 }),
      g(['BCN', 'AGP'], { BCN: 500, AGP: 311 }),
    ])).toEqual({ AYT: 624, BCN: 500, AGP: 311 });
  });

  it('says nothing while a group is still answering', () => {
    expect(mergeDestinationCounts([
      g(['AYT'], { AYT: 624 }),
      { dests: ['BCN'], done: false, error: null },
    ])).toBeNull();
  });

  it('says nothing when a group failed', () => {
    expect(mergeDestinationCounts([g(['AYT'], { AYT: 624 }, { error: new Error('down') })])).toBeNull();
  });

  it('says nothing when the backend flags the answer incomplete', () => {
    expect(mergeDestinationCounts([
      { dests: ['AYT'], done: true, error: null, destinationFacets: { counts: { AYT: 624 }, complete: false } },
    ])).toBeNull();
  });

  it('says nothing when a group answered without the facet at all', () => {
    expect(mergeDestinationCounts([{ dests: ['AYT'], done: true, error: null, destinationFacets: null }])).toBeNull();
  });

  it('a complete answer of zero is a real answer', () => {
    // Nothing matched here, which is information. Only an answer we do not have is null.
    expect(mergeDestinationCounts([g(['AYT'], { AYT: 0 })])).toEqual({ AYT: 0 });
  });

  it('says nothing when there are no groups', () => {
    expect(mergeDestinationCounts([])).toBeNull();
    expect(mergeDestinationCounts(null)).toBeNull();
  });
});

/**
 * A homepage card's departure window (UI-21, Ch 1 §12B.3).
 *
 * It is where the traveller starts, not what they chose. An explicit date always wins, and the
 * window constrains the travel START only, so a return may fall after it.
 */
describe('packageBody with a card window', () => {
  const fp = { checkIn: '', checkOut: '', adults: 2, children: 0, rooms: 1 };
  const win = { from: '2027-06-01', to: '2027-06-20' };

  it('searches the card window when the traveller has chosen no date', () => {
    const b = packageBody({ fp, dated: true, startWindow: win });
    expect(b.from).toBe('2027-06-01');
    expect(b.to).toBe('2027-06-20');
  });

  it('an explicit date beats the card window', () => {
    // The card suggested June; the traveller said 15 March. Their choice stands, and the
    // window must not quietly widen it back out.
    const b = packageBody({ fp: { ...fp, checkIn: '2027-03-15' }, dated: true, flex: 0, startWindow: win });
    expect(b.from).toBe('2027-03-15');
    expect(b.to).toBe('2027-03-15');
  });

  it('clips a range longer than the endpoint accepts, keeping the soonest departures', () => {
    // /packages takes 31 days. Someone who clicked "June to August" is shown June first
    // rather than getting a 400 nobody can see.
    const b = packageBody({ fp, dated: true, startWindow: { from: '2027-06-01', to: '2027-08-31' } });
    expect(b.from).toBe('2027-06-01');
    const days = (new Date(`${b.to}T00:00:00Z`) - new Date(`${b.from}T00:00:00Z`)) / 86400000 + 1;
    expect(days).toBeLessThanOrEqual(PACKAGE_WINDOW_DAYS);
  });

  it('adds no window when the card carries none, or only half of one', () => {
    expect(packageBody({ fp, dated: true, startWindow: null }).from).toBeUndefined();
    expect(packageBody({ fp, dated: true, startWindow: { from: '2027-06-01' } }).from).toBeUndefined();
    expect(packageBody({ fp, dated: true, startWindow: { to: '2027-06-20' } }).from).toBeUndefined();
  });
});
