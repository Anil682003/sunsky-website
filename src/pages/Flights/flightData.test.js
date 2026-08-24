import { describe, it, expect } from 'vitest';
import { buildContext, mapAirtuerkFlight, fareBreakdown, flightTotal, adultFare, generateFlights } from './flightData';

/* Airtürk's `totalPrice` is the PARTY total — airtuerk.service.js `parseOption()` sums
   (basePrice + taxPrice) × quantity across every passenger type, and a round trip adds
   both directions on top. Reading it as a per-person figure showed a 2-traveller fare at
   double on the card headline AND double again on the "total" line, and sent twice the
   money to the booking API, where the supplier re-price rejects anything more than
   max(€1, 1%) off. These tests pin the unit at every hand-off. */

const legs = [
  { from: 'BRU', to: 'AYT', departure: '2026-09-10T08:00:00', arrival: '2026-09-10T12:30:00', airline: 'TK', flightNumber: '1234' },
  { from: 'AYT', to: 'BRU', departure: '2026-09-17T14:00:00', arrival: '2026-09-17T18:30:00', airline: 'TK', flightNumber: '1235' },
];

const ctxFor = (adults, children = 0, infants = 0) => buildContext(new URLSearchParams({
  from: 'Brussels (BRU)', to: 'Antalya (AYT)', tripType: 'roundtrip',
  date: '2026-09-10', returnDate: '2026-09-17',
  adults: String(adults), children: String(children), infants: String(infants),
}));

/* A one-way search: the round-trip context would split a connecting itinerary in half and
   read each segment as its own non-stop leg. */
const oneWayCtx = () => buildContext(new URLSearchParams({
  from: 'Brussels (BRU)', to: 'Antalya (AYT)', tripType: 'oneway', date: '2026-09-10', adults: '1',
}));

const mapped = (totalPrice, ctx, fareBreakdownRows) =>
  mapAirtuerkFlight(
    { totalPrice, currency: 'EUR', legs, flightKeys: ['k1', 'k2'], fareBreakdown: fareBreakdownRows },
    ctx,
    0,
  );

/* One direction's rows, as parseOption() emits them. A round trip carries a set per
   direction, which extractCheapestFlights concatenates. */
const rows = (perAdult, adults, perChild = 0, children = 0) => {
  const out = [{ paxType: 'ADT', quantity: adults, basePrice: perAdult * 0.8, tax: perAdult * 0.2, totalPerPax: perAdult, subtotal: perAdult * adults }];
  if (children) out.push({ paxType: 'CHD', quantity: children, basePrice: perChild * 0.8, tax: perChild * 0.2, totalPerPax: perChild, subtotal: perChild * children });
  return out;
};

describe('mapAirtuerkFlight — party total vs per adult', () => {
  it('takes the headline from the supplier ADT rows, both directions summed', () => {
    // 2 adults, €370 per adult per direction → €740 adult round trip, €1480 party.
    const f = mapped(1480, ctxFor(2), [...rows(370, 2), ...rows(370, 2)]);
    expect(f.price).toBe(740);
    expect(f.totalPrice).toBe(1480);
  });

  it('reports the ADULT fare, not the party average, when a child is carried', () => {
    // 2 adults @ €740 + 1 child @ €600 = €2080. The party average is €693 — which would
    // under-report what an adult seat actually costs.
    const f = mapped(2080, ctxFor(2, 1), [...rows(370, 2, 300, 1), ...rows(370, 2, 300, 1)]);
    expect(f.pax).toBe(3);
    expect(f.price).toBe(740);
    expect(adultFare(f)).toBe(740);
  });

  it('falls back to the party average when the fare states no passenger rows', () => {
    expect(mapped(1480, ctxFor(2)).price).toBe(740);
    expect(mapped(2080, ctxFor(2, 1)).price).toBe(693);
  });

  it('leaves a single traveller unchanged', () => {
    expect(mapped(740, ctxFor(1), rows(740, 1)).price).toBe(740);
  });

  it('keeps the supplier total exact rather than rebuilding it from the rounded headline', () => {
    const f = mapped(1481.37, ctxFor(2));
    expect(f.totalPrice).toBe(1481.37);
    expect(flightTotal(f)).toBe(1481.37);
    expect(f.price * f.pax).not.toBe(1481.37);
  });
});

describe('mapAirtuerkFlight — what the detail page reads off a leg', () => {
  const f = mapped(1480, ctxFor(2), [...rows(370, 2), ...rows(370, 2)]);

  it('labels each half of a round trip with its own direction', () => {
    // Both blocks used to be headed "Return" because live legs carried no `dir`.
    expect(f.out.dir).toBe('out');
    expect(f.ret.dir).toBe('ret');
  });

  it('resolves airport and airline codes to names', () => {
    expect(f.out.fromCity).toBe('Brussels');
    expect(f.out.toCity).toBe('Antalya');
    expect(f.out.airline).toBe('Turkish Airlines');
    expect(f.out.flightNo).toBe('TK 1234');
  });

  it('states no aircraft, terminal or cabin, because the fare states none', () => {
    expect(f.out.aircraft).toBe('');
    expect(f.out.fromTerminal).toBe('');
    expect(f.cabin).toBeNull();
  });

  it('carries the supplier baggage allowance down to the leg', () => {
    const withBags = mapAirtuerkFlight(
      { totalPrice: 1480, currency: 'EUR', legs, baggage: { checkedKg: 15, checkedPieces: 0, handKg: 0 } },
      ctxFor(2), 0,
    );
    expect(withBags.out.baggage.checkedKg).toBe(15);
    expect(withBags.baggage.checkedKg).toBe(15);
  });

  it('names the connection on a 1-stop leg instead of reporting none', () => {
    const viaIst = mapAirtuerkFlight({
      totalPrice: 900, currency: 'EUR',
      legs: [
        { from: 'BRU', to: 'IST', departure: '2026-09-10T08:00:00', arrival: '2026-09-10T12:00:00', airline: 'TK', flightNumber: '1' },
        { from: 'IST', to: 'AYT', departure: '2026-09-10T14:00:00', arrival: '2026-09-10T15:30:00', airline: 'TK', flightNumber: '2' },
      ],
    }, oneWayCtx(), 0);
    expect(viaIst.out.stops).toBe(1);
    expect(viaIst.out.layover.code).toBe('IST');
    expect(viaIst.out.layover.city).toBe('Istanbul');
    expect(viaIst.out.layover.durLabel).toBe('2h 00m');
  });
});

describe('fareBreakdown', () => {
  it('bills the party once — never per-person × pax × pax', () => {
    const fb = fareBreakdown(mapped(1480, ctxFor(2)));
    expect(fb.total).toBe(1480);
    expect(fb.perPerson).toBe(740);
  });

  it('splits base and tax from the supplier rows, summing to the exact total', () => {
    const fb = fareBreakdown(mapped(1480, ctxFor(2), [...rows(370, 2), ...rows(370, 2)]));
    expect(fb.baseFare).toBeCloseTo(1184, 2);   // 370 × 0.8 × 2 adults × 2 directions
    expect(fb.taxes).toBeCloseTo(296, 2);
    expect(fb.baseFare + fb.taxes).toBeCloseTo(fb.total, 2);
  });

  it('claims no split at all when the fare states none', () => {
    // Rather than inventing one with fixed 74% / 17% ratios and an "airline fuel surcharge".
    const fb = fareBreakdown(mapped(1480, ctxFor(2)));
    expect(fb.baseFare).toBeNull();
    expect(fb.taxes).toBeNull();
  });

  it('hands the checkout a per-person figure that multiplies back to the exact total', () => {
    // Checkout.jsx computes `booking.ppPrice * travellers.length`.
    const ctx = ctxFor(3);
    const fb = fareBreakdown(mapped(2222, ctx));
    expect(fb.perPerson * ctx.pax).toBeCloseTo(2222, 2);
  });

  it('still prices the sample generator per person, which has no supplier total', () => {
    const g = generateFlights(ctxFor(2))[0];
    const fb = fareBreakdown(g);
    expect(g.totalPrice).toBeUndefined();
    expect(fb.perPerson).toBe(g.price);
    expect(fb.total).toBe(g.price * 2);
  });
});
