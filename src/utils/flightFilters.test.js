import { describe, it, expect } from 'vitest';
import {
  bandOf, hourOf, stopsOf, durationOf, flightFacets, applyFlightFilters, sortFlights, splitRoundTrip,
  dedupeFares,
} from './flightFilters';

// Shape mirrors what HotelDetail builds from /flight-availability/search.
// Times are written WITHOUT a zone so `new Date()` reads them as local — the same clock
// `fmtTime` prints on the card.
const leg = (dep, arr, o = {}) => ({ departure: dep, arrival: arr, duration: 230, from: 'AMS', to: 'AYT', airline: 'ARKEFLY', ...o });
const flight = (o = {}) => ({
  totalPrice: 500, currency: 'EUR',
  outLegs: [leg('2026-05-01T07:00:00', '2026-05-01T11:50:00')],
  retLegs: [leg('2026-05-06T12:45:00', '2026-05-06T16:00:00', { from: 'AYT', to: 'AMS' })],
  stops: 0, fareBreakdown: [], flightKeys: ['k'],
  ...o,
});

describe('hourOf / bandOf', () => {
  it('buckets by the same local clock the card prints', () => {
    expect(hourOf('2026-05-06T12:45:00')).toBe(12);
    expect(bandOf('2026-05-06T12:45:00')).toBe('afternoon');
  });

  it('covers each band at its edges', () => {
    expect(bandOf('2026-05-01T00:00:00')).toBe('early');
    expect(bandOf('2026-05-01T06:59:00')).toBe('early');
    expect(bandOf('2026-05-01T07:00:00')).toBe('morning');
    expect(bandOf('2026-05-01T11:59:00')).toBe('morning');
    expect(bandOf('2026-05-01T12:00:00')).toBe('afternoon');
    expect(bandOf('2026-05-01T17:59:00')).toBe('afternoon');
    expect(bandOf('2026-05-01T18:00:00')).toBe('evening');
    expect(bandOf('2026-05-01T23:59:00')).toBe('evening');
  });

  it('falls back to a bare HH:MM string', () => {
    expect(bandOf('22:45')).toBe('evening');
  });

  it('returns null rather than guessing on junk', () => {
    for (const bad of [null, undefined, '', 'tomorrow', {}]) expect(bandOf(bad)).toBeNull();
  });
});

describe('the bug from the screenshot', () => {
  // Return filter set to early+morning+evening, yet a 12:45 (afternoon) return was listed,
  // because the checkboxes were never read. This is that exact case.
  const flights = [
    flight({ retLegs: [leg('2026-05-06T12:45:00', '2026-05-06T16:00:00')] }), // afternoon
    flight({ retLegs: [leg('2026-05-06T22:45:00', '2026-05-07T02:10:00')] }), // evening
  ];

  it('drops the afternoon return once the traveller excludes afternoon', () => {
    const kept = applyFlightFilters(flights, { return: ['early', 'morning', 'evening'] });
    expect(kept).toHaveLength(1);
    expect(kept[0].retLegs[0].departure).toContain('22:45');
  });
});

describe('applyFlightFilters', () => {
  const flights = [
    flight({ totalPrice: 400, outLegs: [leg('2026-05-01T05:00:00', '2026-05-01T09:00:00')] }),
    flight({ totalPrice: 500, outLegs: [leg('2026-05-01T14:30:00', '2026-05-01T18:20:00')] }),
    flight({ totalPrice: 600, stops: 1, outLegs: [leg('2026-05-01T20:00:00', '2026-05-02T01:00:00')] }),
  ];

  it('treats an empty selection as no constraint', () => {
    expect(applyFlightFilters(flights, {})).toHaveLength(3);
    expect(applyFlightFilters(flights, { outbound: [] })).toHaveLength(3);
  });

  it('ORs within a group', () => {
    expect(applyFlightFilters(flights, { outbound: ['early', 'evening'] })).toHaveLength(2);
  });

  it('ANDs across groups', () => {
    // Evening outbound AND direct → the 20:00 flight is evening but has a stop.
    expect(applyFlightFilters(flights, { outbound: ['evening'], direct: true })).toHaveLength(0);
    expect(applyFlightFilters(flights, { outbound: ['early'], direct: true })).toHaveLength(1);
  });

  it('filters on stops', () => {
    expect(applyFlightFilters(flights, { direct: true })).toHaveLength(2);
  });

  it('can legitimately return nothing', () => {
    expect(applyFlightFilters(flights, { outbound: ['morning'] })).toHaveLength(0);
  });

  it('does not mutate the input', () => {
    const copy = [...flights];
    applyFlightFilters(flights, { direct: true });
    expect(flights).toEqual(copy);
  });
});

describe('flightFacets — only offers controls that can change the result', () => {
  it('hides the return group entirely on a one-way search', () => {
    const oneWay = [flight({ retLegs: [] }), flight({ retLegs: [] })];
    const f = flightFacets(oneWay);
    expect(f.hasReturn).toBe(false);
    expect(f.return).toEqual([]);
  });

  it('hides a time group when every flight sits in one band', () => {
    // Ticking the only band changes nothing; ticking any other empties the list.
    const sameBand = [flight(), flight()]; // both depart 07:00
    expect(flightFacets(sameBand).outbound).toEqual([]);
  });

  it('offers the time group once the flights actually differ', () => {
    const mixed = [
      flight(),
      flight({ outLegs: [leg('2026-05-01T14:30:00', '2026-05-01T18:20:00')] }),
    ];
    const out = flightFacets(mixed).outbound;
    expect(out.map((b) => b.id)).toEqual(['morning', 'afternoon']);
    expect(out.every((b) => b.count === 1)).toBe(true);
  });

  it('hides "Direct flights" when every flight is already direct', () => {
    expect(flightFacets([flight(), flight()]).direct).toBeNull();
  });

  it('hides "Direct flights" when none are direct', () => {
    expect(flightFacets([flight({ stops: 1 }), flight({ stops: 2 })]).direct).toBeNull();
  });

  it('offers "Direct flights" with a count when the set is mixed', () => {
    expect(flightFacets([flight(), flight({ stops: 1 })]).direct).toEqual({ count: 1 });
  });

  it('survives an empty or missing list', () => {
    for (const bad of [[], null, undefined]) {
      const f = flightFacets(bad);
      expect(f.outbound).toEqual([]);
      expect(f.direct).toBeNull();
    }
  });
});

describe('sortFlights', () => {
  const a = flight({ totalPrice: 900, outLegs: [leg('2026-05-01T06:00:00', '2026-05-01T10:00:00', { duration: 600 })], retLegs: [] });
  const b = flight({ totalPrice: 400, outLegs: [leg('2026-05-01T20:00:00', '2026-05-02T00:00:00', { duration: 100 })], retLegs: [] });
  const c = flight({ totalPrice: 650, outLegs: [leg('2026-05-01T12:00:00', '2026-05-01T16:00:00', { duration: 300 })], retLegs: [] });

  it('sorts by price, duration and departure', () => {
    expect(sortFlights([a, b, c], 'price').map((f) => f.totalPrice)).toEqual([400, 650, 900]);
    expect(sortFlights([a, b, c], 'duration').map((f) => durationOf(f))).toEqual([100, 300, 600]);
    expect(sortFlights([a, b, c], 'departure').map((f) => f.outLegs[0].departure))
      .toEqual([a, c, b].map((f) => f.outLegs[0].departure));
  });

  it('never sorts the caller\'s array in place', () => {
    // selectedFlight indexes the fetch result — reordering it under the selection would
    // silently switch which flight the traveller booked.
    const input = [a, b, c];
    const snapshot = [...input];
    sortFlights(input, 'price');
    expect(input).toEqual(snapshot);
  });

  it('sinks unreadable keys to the bottom instead of scrambling the rest', () => {
    const broken = flight({ totalPrice: null, retLegs: [] });
    expect(sortFlights([broken, b, c], 'price').map((f) => f.totalPrice)).toEqual([400, 650, null]);
  });

  it('falls back to price on an unknown sort key', () => {
    expect(sortFlights([a, b, c], 'nonsense').map((f) => f.totalPrice)).toEqual([400, 650, 900]);
  });
});

describe('splitRoundTrip — the "BRU → BRU, no return" card', () => {
  // A supplier round trip with every leg in one array and no direction marker. Rendered
  // unsplit the card reads "BRU → BRU · 1 stop" and the return half never appears.
  const roundTrip = [
    { from: 'BRU', to: 'IST', departure: '2026-09-06T07:20:00', arrival: '2026-09-06T11:05:00' },
    { from: 'IST', to: 'AYT', departure: '2026-09-06T12:30:00', arrival: '2026-09-06T13:25:00' },
    { from: 'AYT', to: 'IST', departure: '2026-09-13T14:00:00', arrival: '2026-09-13T15:10:00' },
    { from: 'IST', to: 'BRU', departure: '2026-09-13T16:40:00', arrival: '2026-09-13T19:25:00' },
  ];

  it('splits at the stay, not at a connection', () => {
    const { outLegs, retLegs } = splitRoundTrip(roundTrip, 'BRU');
    expect(outLegs.map((l) => l.to)).toEqual(['IST', 'AYT']);
    expect(retLegs.map((l) => l.to)).toEqual(['IST', 'BRU']);
  });

  it('gives the return filter a departure hour to read', () => {
    const { retLegs } = splitRoundTrip(roundTrip, 'BRU');
    expect(bandOf(retLegs[0].departure)).toBe('afternoon');
  });

  it('leaves a one-way alone', () => {
    const oneWay = [
      { from: 'BRU', to: 'IST', departure: '2026-09-06T07:20:00', arrival: '2026-09-06T11:05:00' },
      { from: 'IST', to: 'AYT', departure: '2026-09-06T12:30:00', arrival: '2026-09-06T13:25:00' },
    ];
    expect(splitRoundTrip(oneWay, 'BRU')).toEqual({ outLegs: oneWay, retLegs: [] });
  });

  it('does not split a long connection that merely returns to the same airport', () => {
    // A 3h stop is a connection, not a holiday — splitting here would invent a return.
    const viaHome = [
      { from: 'BRU', to: 'CDG', departure: '2026-09-06T07:00:00', arrival: '2026-09-06T08:00:00' },
      { from: 'CDG', to: 'BRU', departure: '2026-09-06T11:00:00', arrival: '2026-09-06T12:00:00' },
    ];
    expect(splitRoundTrip(viaHome, 'BRU').retLegs).toEqual([]);
  });

  it('survives unusable or missing legs', () => {
    for (const bad of [null, undefined, [], [{ from: 'BRU', to: 'BRU' }]]) {
      expect(() => splitRoundTrip(bad, 'BRU')).not.toThrow();
      expect(splitRoundTrip(bad, 'BRU').retLegs).toEqual([]);
    }
  });
});

describe('stopsOf / durationOf', () => {
  it('treats a trip as direct only when both directions are', () => {
    expect(stopsOf({ outLegs: [1], retLegs: [1, 2] })).toBe(1);
    expect(stopsOf({ outLegs: [1], retLegs: [1] })).toBe(0);
  });

  it('adds up both directions for duration', () => {
    expect(durationOf({ outLegs: [{ duration: 100 }], retLegs: [{ duration: 50 }] })).toBe(150);
  });
});

// The change-flight modal listed the same aircraft four times over — 17:40 BRU→ADB out,
// 11:25 back, "Cabin bag included · Checked baggage 20 kg" on every one of them, at €1,112,
// €1,120, €1,120 and €1,128. Those are Airtuerk's fare classes, not four flights, and two of
// them did not even differ in price.
describe('dedupeFares', () => {
  // Same aircraft, same times, same allowance — only the fare class (and a few euros) differ.
  const fareClass = (price) => flight({
    totalPrice: price,
    outLegs: [leg('2026-09-13T17:40:00', '2026-09-13T22:00:00', { airline: 'XQ', flightNumber: '1653', from: 'BRU', to: 'ADB' })],
    retLegs: [leg('2026-09-19T11:25:00', '2026-09-19T14:05:00', { airline: 'XQ', flightNumber: '1652', from: 'ADB', to: 'BRU' })],
    baggage: { checkedKg: 20, checkedPieces: 0, handKg: 0 },
  });

  it('shows one card for one flight, not one per fare class', () => {
    const out = dedupeFares([fareClass(1112), fareClass(1120), fareClass(1120), fareClass(1128)]);
    expect(out).toHaveLength(1);
  });

  it('keeps the cheapest of the group, with its booking keys', () => {
    const cheap = { ...fareClass(1112), flightKeys: ['cheap-key'] };
    const dear = { ...fareClass(1128), flightKeys: ['dear-key'] };
    const out = dedupeFares([cheap, dear]);
    expect(out[0].totalPrice).toBe(1112);
    expect(out[0].flightKeys).toEqual(['cheap-key']);
  });

  // A cheaper fare that drops the hold bag is a genuinely different purchase. Collapsing it
  // into the 20kg fare would hide the choice AND quote the wrong allowance for the price.
  it('keeps fares apart when the baggage differs', () => {
    const noBag = { ...fareClass(980), baggage: { checkedKg: 0, checkedPieces: 0, handKg: 0 } };
    expect(dedupeFares([noBag, fareClass(1112)])).toHaveLength(2);
  });

  it('keeps genuinely different itineraries', () => {
    const later = flight({
      totalPrice: 1150,
      outLegs: [leg('2026-09-13T06:15:00', '2026-09-13T10:35:00', { airline: 'XQ', flightNumber: '1655', from: 'BRU', to: 'ADB' })],
      retLegs: [leg('2026-09-19T11:25:00', '2026-09-19T14:05:00', { airline: 'XQ', flightNumber: '1652', from: 'ADB', to: 'BRU' })],
      baggage: { checkedKg: 20, checkedPieces: 0, handKg: 0 },
    });
    expect(dedupeFares([fareClass(1112), later])).toHaveLength(2);
  });

  // Nothing to compare on means nothing may be thrown away: a feed with no flight numbers and
  // no departure times must not collapse every option into one.
  it('passes through fares it cannot identify', () => {
    const blank = { totalPrice: 500, outLegs: [{ from: 'BRU', to: 'ADB' }], retLegs: [] };
    expect(dedupeFares([blank, { ...blank, totalPrice: 600 }])).toHaveLength(2);
  });

  it('survives junk input', () => {
    expect(dedupeFares(null)).toEqual([]);
    expect(() => dedupeFares([null, undefined])).not.toThrow();
  });
});
