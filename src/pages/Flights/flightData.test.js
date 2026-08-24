import { describe, it, expect } from 'vitest';
import { buildContext, mapAirtuerkFlight, fareBreakdown, flightTotal, generateFlights } from './flightData';

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

const mapped = (totalPrice, ctx) =>
  mapAirtuerkFlight({ totalPrice, currency: 'EUR', legs, flightKeys: ['k1', 'k2'] }, ctx, 0);

describe('mapAirtuerkFlight — party total vs per person', () => {
  it('divides the supplier party total into a per-person headline', () => {
    expect(mapped(1480, ctxFor(2)).price).toBe(740);
    expect(mapped(2220, ctxFor(3)).price).toBe(740);
  });

  it('leaves a single traveller unchanged', () => {
    expect(mapped(740, ctxFor(1)).price).toBe(740);
  });

  it('counts children and infants in the party, as the supplier fare does', () => {
    // 2 adults @ €740 + 1 child @ €600 = €2080 for three travellers.
    const f = mapped(2080, ctxFor(2, 1));
    expect(f.pax).toBe(3);
    expect(f.price).toBe(693);
  });

  it('keeps the supplier total exact rather than rebuilding it from the rounded headline', () => {
    const f = mapped(1481.37, ctxFor(2));
    expect(f.totalPrice).toBe(1481.37);
    expect(flightTotal(f)).toBe(1481.37);
    // The old card multiplied the rounded per-person figure back up and drifted.
    expect(f.price * f.pax).not.toBe(1481.37);
  });
});

describe('fareBreakdown', () => {
  it('bills the party once — never per-person × pax × pax', () => {
    const fb = fareBreakdown(mapped(1480, ctxFor(2)));
    expect(fb.total).toBe(1480);
    expect(fb.perPerson).toBe(740);
  });

  it('sums its rows to the total the supplier will re-price at', () => {
    const fb = fareBreakdown(mapped(1480, ctxFor(2)));
    expect(fb.baseFare + fb.taxes + fb.surcharge).toBeCloseTo(fb.total, 2);
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
