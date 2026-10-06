// The package a results card priced, carried to the hotel page (7 Oct 2026).
import { describe, it, expect } from 'vitest';
import {
  flightNumberKey, encodeLegs, decodeLegs, legsMatch, packageFromOffer, packageParams, packageFromParams,
  packageApplies, flightQuestion, flightIsPackage, confirmBody, mergePackageFlight, matrixDays, PACKAGE_FLIGHT,
} from './packageHandoff';

// An overnight outbound (leaves the 11th, lands the 12th) and an early return: the flight dates
// are not the stay dates.
const offer = {
  hotelCode: '592205', departureAirport: 'FRA', arrivalAirport: 'AYT',
  stay: { checkin: '2026-12-12', checkout: '2026-12-18', nights: 6 },
  components: { flight: 402.5, hotel: 113 },
  flight: {
    travelDays: 8, price: 402.5,
    outbound: { departureDate: '2026-12-11', origin: 'FRA', destination: 'AYT', legs: [{ from: 'FRA', to: 'AYT', airline: 'XQ', flightNumber: 'XQ0141', departure: '2026-12-11T23:35:00', arrival: '2026-12-12T04:10:00' }] },
    inbound: { departureDate: '2026-12-18', legs: [{ from: 'AYT', to: 'FRA', airline: 'XQ', flightNumber: '140', departure: '2026-12-18T09:15', arrival: '2026-12-18T12:05' }] },
  },
};
const params = (o) => { const qs = new URLSearchParams({ checkIn: '2026-12-12', checkOut: '2026-12-18', origin: 'BRU', ...o }); return (k) => qs.get(k); };

describe('flights as text', () => {
  it('a flight number without its airline or leading zeros', () => {
    expect(flightNumberKey('TK', 'TK0123')).toBe('123');
    expect(flightNumberKey('TK', 'TK 123')).toBe('123');
    expect(flightNumberKey('tk', '123')).toBe('123');
    expect(flightNumberKey('XQ', '0')).toBe('0');
  });

  it('legs round-trip through the URL, to the minute', () => {
    const s = encodeLegs(offer.flight.outbound.legs);
    expect(s).toBe('XQ|141|2026-12-11T23:35');
    expect(decodeLegs(s)).toEqual([{ airline: 'XQ', flightNumber: '141', departure: '2026-12-11T23:35' }]);
    const two = encodeLegs([{ airline: 'TK', flightNumber: '1590', departure: '2026-12-11 06:00' }, { airline: 'TK', flightNumber: '2410', departure: '2026-12-11T10:30:00' }]);
    expect(two).toBe('TK|1590|2026-12-11T06:00~TK|2410|2026-12-11T10:30');
  });

  it('a leg missing its number or time is not carried at all (never half a flight)', () => {
    expect(encodeLegs([{ airline: 'TK', flightNumber: '1', departure: '2026-12-11' }])).toBe('');
    expect(encodeLegs([{ airline: 'TK', departure: '2026-12-11T10:00' }])).toBe('');
    expect(encodeLegs([])).toBe('');
    expect(decodeLegs('TK|1|2026-12-11T10:00~broken')).toEqual([]);
    expect(decodeLegs('')).toEqual([]);
  });

  it('matching: airline, number and departure minute, leg by leg', () => {
    const p = [{ airline: 'TK', flightNumber: '1590', departure: '2026-12-11T06:00' }];
    expect(legsMatch(p, [{ airline: 'TK', flightNumber: 'TK1590', departure: '2026-12-11T06:00:00' }])).toBe(true);
    expect(legsMatch(p, [{ airline: 'TK', flightNumber: '1590', departure: '2026-12-11T06:05:00' }])).toBe(false);   // other time
    expect(legsMatch(p, [{ airline: 'PC', flightNumber: '1590', departure: '2026-12-11T06:00' }])).toBe(false);      // other airline
    expect(legsMatch(p, [p[0], p[0]])).toBe(false);                                                              // other routing
    expect(legsMatch([], [])).toBe(false);
  });
});

describe('the package between the card and the hotel page', () => {
  it('a /packages hotel: flight dates, arrival airport, legs, flight price, trip length', () => {
    expect(packageFromOffer(offer)).toEqual({
      from: 'FRA', to: 'AYT', depdate: '2026-12-11', retdate: '2026-12-18', checkin: '2026-12-12', checkout: '2026-12-18',
      nights: 6, travelDays: 8, flightPrice: 402.5,
      outLegs: [{ airline: 'XQ', flightNumber: '141', departure: '2026-12-11T23:35' }],
      backLegs: [{ airline: 'XQ', flightNumber: '140', departure: '2026-12-18T09:15' }],
    });
  });

  it('URL parameters there and back give the same package', () => {
    const qs = packageParams(offer);
    expect(qs).toEqual({ pkgOut: 'XQ|141|2026-12-11T23:35', pkgBack: 'XQ|140|2026-12-18T09:15', pkgDep: '2026-12-11', pkgRet: '2026-12-18', pkgFrom: 'FRA', pkgTo: 'AYT', pkgFlight: '402.5', pkgDays: '8' });
    expect(packageFromParams(params(qs))).toEqual(packageFromOffer(offer));
  });

  it('nothing is carried for an offer without a complete round trip', () => {
    expect(packageParams({ ...offer, flight: { ...offer.flight, inbound: { departureDate: '2026-12-18', legs: [] } } })).toEqual({});
    expect(packageParams({ ...offer, stay: null })).toEqual({});
    expect(packageParams(null)).toEqual({});
    expect(packageFromParams(params({}))).toBeNull();                                         // a plain hotel link
    expect(packageFromParams(params({ ...packageParams(offer), pkgTo: 'x' }))).toBeNull();     // tampered
    expect(packageFromParams(params({ ...packageParams(offer), pkgBack: '' }))).toBeNull();
  });

  it('no flight price is no price, never €0', () => {
    expect(packageFromOffer({ ...offer, components: {}, flight: { ...offer.flight, price: null } }).flightPrice).toBeNull();
    expect(packageFromParams(params({ ...packageParams(offer), pkgFlight: '0' })).flightPrice).toBeNull();
  });

  it('the package answers only its own stay; every other day asks the stay dates as before', () => {
    const pkg = packageFromOffer(offer);
    expect(packageApplies(pkg, '2026-12-12', '2026-12-18')).toBe(true);
    expect(packageApplies(pkg, '2026-12-12', '2026-12-19')).toBe(false);
    expect(packageApplies(null, '2026-12-12', '2026-12-18')).toBe(false);
    expect(flightQuestion(pkg, '2026-12-12', '2026-12-18', 'TRAYT')).toEqual({ depdate: '2026-12-11', retdate: '2026-12-18', to: 'AYT' });
    expect(flightQuestion(pkg, '2026-12-13', '2026-12-19', 'TRAYT')).toEqual({ depdate: '2026-12-13', retdate: '2026-12-19', to: 'TRAYT' });
    expect(flightQuestion(null, '2026-12-13', '2026-12-19', 'AYT')).toEqual({ depdate: '2026-12-13', retdate: '2026-12-19', to: 'AYT' });
  });

  it('the confirm body: package dates and airports, the fare party, the legs, the quoted price', () => {
    const pkg = packageFromOffer(offer);
    expect(confirmBody(pkg, { adults: 2, children: 1, infants: 0 })).toEqual({
      from: 'FRA', to: 'AYT', depdate: '2026-12-11', retdate: '2026-12-18', adults: 2, children: 1, infants: 0,
      outbound: { legs: [{ airline: 'XQ', flightNumber: '141', departure: '2026-12-11T23:35' }] },
      inbound: { legs: [{ airline: 'XQ', flightNumber: '140', departure: '2026-12-18T09:15' }] },
      totalPrice: 402.5,
    });
    expect(confirmBody({ ...pkg, flightPrice: null }, { adults: 1, children: 0, infants: 0 }).totalPrice).toBeUndefined();
  });
});

describe('the package flight in the live list', () => {
  const pkg = packageFromOffer(offer);
  const sig = (f) => `${f.outLegs.map((l) => l.flightNumber + l.departure).join()}~${f.retLegs.map((l) => l.flightNumber + l.departure).join()}`;
  const fl = (price, out = '141', outDep = '2026-12-11T23:35:00', back = '140') => ({
    totalPrice: price,
    outLegs: [{ airline: 'XQ', flightNumber: out, departure: outDep }],
    retLegs: [{ airline: 'XQ', flightNumber: back, departure: '2026-12-18T09:15:00' }],
  });

  it('recognised both ways', () => {
    expect(flightIsPackage(fl(400), pkg)).toBe(true);
    expect(flightIsPackage(fl(400, '999'), pkg)).toBe(false);
    expect(flightIsPackage(fl(400, '141', '2026-12-11T23:35', '999'), pkg)).toBe(false);
    expect(flightIsPackage(fl(400), null)).toBe(false);
  });

  it('already in the list: kept, found, nothing added', () => {
    const r = mergePackageFlight([fl(300, '7'), fl(410)], [], pkg, sig, null);
    expect(r.flights.map((f) => f.totalPrice)).toEqual([300, 410]);
    expect(r.status).toBe(PACKAGE_FLIGHT.CONFIRMED);
    expect(r.pkgSig).toBe(sig(fl(410)));
  });

  it('beyond the capped list: the confirmed flight is added in price order', () => {
    const r = mergePackageFlight([fl(300, '7'), fl(500, '8')], [fl(402.5)], pkg, sig, 'CONFIRMED');
    expect(r.flights.map((f) => f.totalPrice)).toEqual([300, 402.5, 500]);
    expect(r.pkgSig).toBe(sig(fl(402.5)));
  });

  it('in both: one card, the cheaper fare', () => {
    const r = mergePackageFlight([fl(420)], [fl(402.5)], pkg, sig, 'PRICE_CHANGED');
    expect(r.flights.map((f) => f.totalPrice)).toEqual([402.5]);
  });

  it('a confirm answer that is another flight is never added', () => {
    const r = mergePackageFlight([fl(300, '7')], [fl(200, '9')], pkg, sig, 'CONFIRMED');
    expect(r.flights.map((f) => f.totalPrice)).toEqual([300]);
    expect(r.status).toBe(PACKAGE_FLIGHT.UNKNOWN);
  });

  it('gone: NOT_AVAILABLE only when the supplier said so; a failed check is UNKNOWN', () => {
    expect(mergePackageFlight([fl(300, '7')], [], pkg, sig, 'NOT_AVAILABLE')).toMatchObject({ status: PACKAGE_FLIGHT.NOT_AVAILABLE, pkgSig: null });
    expect(mergePackageFlight([fl(300, '7')], [], pkg, sig, 'SOURCE_ERROR').status).toBe(PACKAGE_FLIGHT.UNKNOWN);
    expect(mergePackageFlight([fl(300, '7')], [], pkg, sig, null).status).toBe(PACKAGE_FLIGHT.UNKNOWN);
    expect(mergePackageFlight([], [], pkg, sig, 'NOT_AVAILABLE').flights).toEqual([]);
  });
});

describe('the package matrix as the price strip', () => {
  const cell = (date, total, extra = {}) => ({
    date, state: 'AVAILABLE', sunskyPayableTotal: total, pricePerPerson: Math.ceil(total / 2), travelDays: 8, currency: 'EUR',
    departureAirport: 'FRA', arrivalAirport: 'AYT',
    stay: { checkin: extra.checkin || date, checkout: extra.checkout || '2026-12-18', nights: extra.nights || 7 },
    flight: { price: 400, outbound: { departureDate: date, legs: [{ airline: 'XQ', flightNumber: '141', departure: `${date}T10:00` }] }, inbound: { departureDate: '2026-12-18', legs: [{ airline: 'XQ', flightNumber: '140', departure: '2026-12-18T12:00' }] } },
    ...extra,
  });

  it('keyed by the stay check-in, showing the departure date; the package rides along', () => {
    const days = matrixDays([cell('2026-12-11', 515, { checkin: '2026-12-12', nights: 6, cheapest: true }), cell('2026-12-13', 600)]);
    expect(days.map((d) => [d.iso, d.departure, d.price, d.perPerson, d.nights, d.cheapest])).toEqual([
      ['2026-12-12', '2026-12-11', 515, 258, 6, true],
      ['2026-12-13', '2026-12-13', 600, 300, 5, false],
    ]);
    expect(days[0].pkg).toMatchObject({ depdate: '2026-12-11', checkin: '2026-12-12', to: 'AYT', from: 'FRA' });
  });

  it('cells without a price: a day to check or a day with nothing to sell, never a price', () => {
    const days = matrixDays([{ date: '2026-12-14', state: 'SOURCE_ERROR', flights: 2 }, { date: '2026-12-15', state: 'NO_VALID_COMBINATION', flights: 1 }]);
    expect(days.map((d) => [d.iso, d.price, d.state, d.pkg])).toEqual([
      ['2026-12-14', 0, 'SOURCE_ERROR', null],
      ['2026-12-15', 0, 'NO_VALID_COMBINATION', null],
    ]);
  });

  it('two flight dates with one stay keep the cheaper', () => {
    const days = matrixDays([cell('2026-12-11', 700, { checkin: '2026-12-12' }), cell('2026-12-12', 650)]);
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ iso: '2026-12-12', departure: '2026-12-12', price: 650 });
  });

  it('nothing to read is nothing to show', () => {
    expect(matrixDays(null)).toEqual([]);
    expect(matrixDays([{ state: 'AVAILABLE' }])).toEqual([]);
  });
});
