import { describe, it, expect } from 'vitest';

import {
  confirmBody,
  canConfirm,
  readConfirm,
  CONFIRMED,
  PRICE_CHANGED,
  NOT_AVAILABLE,
  SOURCE_ERROR,
} from './confirmFlight';

/**
 * UI-16. The cached list is fast but indicative and carries no bookable keys, so Select runs one
 * live check. These tests hold the line that matters: a check that could not be made is never
 * reported as a flight that is gone.
 */

const outLegs = [{ from: 'BRU', to: 'AYT', departure: '2026-11-03T08:00', airline: 'XQ', flightNumber: 'XQ551' }];
const inLegs = [{ from: 'AYT', to: 'BRU', departure: '2026-11-10T13:00', airline: 'XQ', flightNumber: 'XQ552' }];

const roundTrip = {
  totalPrice: 460,
  confirm: { outbound: { legs: outLegs }, inbound: { legs: inLegs }, legs: [...outLegs, ...inLegs] },
};
const oneWay = { totalPrice: 240, confirm: { outbound: null, inbound: null, legs: outLegs } };

const search = {
  from: { code: 'BRU' }, to: { code: 'AYT' },
  depISO: '2026-11-03', retISO: '2026-11-10',
  tripType: 'roundtrip', adults: 2, children: 0, infants: 0,
};

const liveFlight = (extra = {}) => ({ flightKeys: ['K1', 'K2'], offerValidation: 'LIVE_CONFIRMED', ...extra });

describe('confirmBody', () => {
  it('sends the search fields and the supplier party total, not the per-person price', () => {
    const body = confirmBody(roundTrip, search);
    expect(body).toMatchObject({
      from: 'BRU', to: 'AYT', depdate: '2026-11-03', retdate: '2026-11-10',
      adults: 2, children: 0, infants: 0, totalPrice: 460,
    });
  });

  it('sends the legs exactly as they arrived', () => {
    // The server matches on airline, flight number and local departure to the minute. Any
    // reshaping here turns a bookable flight into NOT_AVAILABLE.
    expect(confirmBody(roundTrip, search).outbound.legs).toBe(outLegs);
    expect(confirmBody(roundTrip, search).inbound.legs).toBe(inLegs);
  });

  it('a one-way sends legs and no inbound at all', () => {
    const body = confirmBody(oneWay, { ...search, tripType: 'oneway', retISO: '' });
    expect(body.legs).toBe(outLegs);
    expect(body.inbound).toBeUndefined();
    expect(body.outbound).toBeUndefined();
    expect(body.retdate).toBeUndefined();
  });

  it('no return date is sent when the trip is not a round trip', () => {
    const body = confirmBody(roundTrip, { ...search, tripType: 'oneway' });
    expect(body.retdate).toBeUndefined();
  });
});

describe('canConfirm', () => {
  it('is true when the original itinerary survived the mapping', () => {
    expect(canConfirm(roundTrip)).toBe(true);
    expect(canConfirm(oneWay)).toBe(true);
  });

  it('is false when it did not, so we never post a body the server cannot match', () => {
    expect(canConfirm({ totalPrice: 100 })).toBe(false);
    expect(canConfirm({ confirm: { outbound: null, inbound: null, legs: [] } })).toBe(false);
    expect(canConfirm(null)).toBe(false);
  });
});

describe('readConfirm', () => {
  it('CONFIRMED hands back the live flight to carry into checkout', () => {
    const r = readConfirm({ status: 'CONFIRMED', flight: liveFlight() }, null);
    expect(r.kind).toBe(CONFIRMED);
    expect(r.flight.flightKeys).toEqual(['K1', 'K2']);
  });

  it('PRICE_CHANGED carries the new price and the difference', () => {
    const r = readConfirm(
      { status: 'PRICE_CHANGED', flight: liveFlight(), livePrice: 505, difference: 45 },
      null,
    );
    expect(r.kind).toBe(PRICE_CHANGED);
    expect(r.livePrice).toBe(505);
    expect(r.difference).toBe(45);
  });

  it('NOT_AVAILABLE keeps the reason', () => {
    const r = readConfirm({ status: 'NOT_AVAILABLE', reason: 'NOT_SOLD_TOGETHER' }, null);
    expect(r.kind).toBe(NOT_AVAILABLE);
    expect(r.reason).toBe('NOT_SOLD_TOGETHER');
  });

  /* ── the part that protects the sale ─────────────────────────────────── */

  it('a 502 is a check that did not happen, never a sold-out flight', () => {
    const r = readConfirm(null, { response: { status: 502 } });
    expect(r.kind).toBe(SOURCE_ERROR);
    expect(r.status).toBe(502);
  });

  it('a network failure or timeout is also only a failed check', () => {
    expect(readConfirm(null, new Error('timeout')).kind).toBe(SOURCE_ERROR);
    expect(readConfirm(null, { request: {} }).kind).toBe(SOURCE_ERROR);
  });

  it('the server\'s own SOURCE_ERROR status reads the same way', () => {
    expect(readConfirm({ status: 'SOURCE_ERROR' }, null).kind).toBe(SOURCE_ERROR);
  });

  it('an unknown or empty answer is not treated as either outcome', () => {
    // Guessing "available" sends someone to checkout with nothing to book; guessing
    // "sold out" loses a sale. Neither is worth it for a body we do not recognise.
    expect(readConfirm({ success: false }, null).kind).toBe(SOURCE_ERROR);
    expect(readConfirm({}, null).kind).toBe(SOURCE_ERROR);
    expect(readConfirm(null, null).kind).toBe(SOURCE_ERROR);
    expect(readConfirm({ status: 'SOMETHING_NEW' }, null).kind).toBe(SOURCE_ERROR);
  });

  it('a confirmation with no bookable keys is refused, not carried to checkout', () => {
    // The whole point of confirming is to get keys. A CONFIRMED without them would send the
    // traveller to a payment screen holding nothing to reserve.
    expect(readConfirm({ status: 'CONFIRMED', flight: { flightKeys: [] } }, null).kind).toBe(SOURCE_ERROR);
    expect(readConfirm({ status: 'CONFIRMED' }, null).kind).toBe(SOURCE_ERROR);
    expect(readConfirm({ status: 'PRICE_CHANGED', flight: { flightKeys: [] }, livePrice: 9 }, null).kind)
      .toBe(SOURCE_ERROR);
  });

  it('PRICE_CHANGED without usable numbers still confirms the flight', () => {
    // The keys are what make it bookable; a missing difference is a display detail.
    const r = readConfirm({ status: 'PRICE_CHANGED', flight: liveFlight() }, null);
    expect(r.kind).toBe(PRICE_CHANGED);
    expect(r.livePrice).toBeNull();
    expect(r.difference).toBeNull();
  });
});
