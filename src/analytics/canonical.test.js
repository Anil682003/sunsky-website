import { describe, it, expect } from 'vitest';
import {
  productType, boardType, isoDate, airport, money, count, text, hotelId, compact,
} from './canonical';

/**
 * The canonical mapping rules, tested on their own.
 *
 * These are the functions whose failure mode is silent: a wrong board family or a date
 * shifted by a day does not throw, it just quietly corrupts a GA4 dimension for as long as
 * nobody checks. So they are tested harder than their size suggests.
 */

describe('productType (Tracking Master §4)', () => {
  it('maps the three canonical products', () => {
    expect(productType({ transport: 'package' })).toBe('FLIGHT_HOTEL');
    expect(productType({ transport: 'hotel_only' })).toBe('HOTEL_ONLY');
    expect(productType({ kind: 'flight' })).toBe('FLIGHT_ONLY');
  });

  it('refuses to name a transfer, rather than inventing a fourth type', () => {
    // §4 permits exactly three values. Labelling a transfer HOTEL_ONLY to make an event
    // fire would be worse than not tracking it.
    expect(productType({ kind: 'transfer' })).toBeNull();
    expect(productType({ kind: 'transfer', transport: 'hotel_only' })).toBeNull();
  });

  it('returns null when it cannot tell', () => {
    expect(productType({})).toBeNull();
    expect(productType()).toBeNull();
  });

  it('lets an explicit flight booking win over a leftover transport value', () => {
    expect(productType({ kind: 'flight', transport: 'hotel_only' })).toBe('FLIGHT_ONLY');
  });
});

describe('boardType (Tracking Master §7)', () => {
  it('maps the Hotelbeds codes onto the five canonical families', () => {
    expect(boardType('RO')).toBe('ROOM_ONLY');
    expect(boardType('SC')).toBe('ROOM_ONLY');
    expect(boardType('BB')).toBe('BED_BREAKFAST');
    expect(boardType('HB')).toBe('HALF_BOARD');
    expect(boardType('FB')).toBe('FULL_BOARD');
    expect(boardType('AI')).toBe('ALL_INCLUSIVE');
  });

  it('treats every breakfast variant as one family', () => {
    // Continental, American, buffet, English, Irish, Scottish, light, two-guest. A hotel's
    // description of the same meal must not become eight GA4 dimensions.
    for (const code of ['CB', 'AB', 'DB', 'GB', 'IB', 'SB', 'LB', 'B2']) {
      expect(boardType(code)).toBe('BED_BREAKFAST');
    }
  });

  it('keeps the all-inclusive tiers together', () => {
    for (const code of ['AS', 'TL', 'UAI', 'TI']) expect(boardType(code)).toBe('ALL_INCLUSIVE');
  });

  it('reads a printed label when no code was carried', () => {
    expect(boardType('All inclusive')).toBe('ALL_INCLUSIVE');
    expect(boardType('Half Board')).toBe('HALF_BOARD');
    expect(boardType('Bed & Breakfast')).toBe('BED_BREAKFAST');
    expect(boardType('Room Only')).toBe('ROOM_ONLY');
  });

  it('prefers "ultra all inclusive" to the bare all-inclusive match', () => {
    expect(boardType('Ultra All Inclusive')).toBe('ALL_INCLUSIVE');
  });

  it('returns null for something it does not recognise', () => {
    // §18: omitting the dimension loses one field. Guessing corrupts it for every booking
    // that shares the code.
    expect(boardType('ZZ')).toBeNull();
    expect(boardType('')).toBeNull();
    expect(boardType(null)).toBeNull();
  });
});

describe('isoDate (Tracking Master §6)', () => {
  it('formats YYYY-MM-DD', () => {
    expect(isoDate('2026-10-15')).toBe('2026-10-15');
    expect(isoDate(new Date(2026, 9, 15))).toBe('2026-10-15');
  });

  it('drops a time part that was already canonical', () => {
    expect(isoDate('2026-10-15T22:30:00')).toBe('2026-10-15');
  });

  /**
   * THE BUG THIS EXISTS TO PREVENT. `new Date(2026, 0, 1).toISOString()` is "2025-12-31" in
   * any negative-offset timezone, so a naive implementation reports every booking's
   * departure a day early for part of the world. Local calendar parts, never UTC.
   */
  it('uses the local calendar date, not UTC', () => {
    const localMidnight = new Date(2026, 0, 1, 0, 0, 0);
    expect(isoDate(localMidnight)).toBe('2026-01-01');
    const localLateEvening = new Date(2026, 5, 30, 23, 59, 59);
    expect(isoDate(localLateEvening)).toBe('2026-06-30');
  });

  it('returns null rather than a bad date', () => {
    expect(isoDate('')).toBeNull();
    expect(isoDate(null)).toBeNull();
    expect(isoDate('not a date')).toBeNull();
  });
});

describe('airport (Tracking Master §6)', () => {
  it('uppercases a three-letter IATA code', () => {
    expect(airport('bru')).toBe('BRU');
    expect(airport(' AMS ')).toBe('AMS');
  });

  it('rejects anything that is not one', () => {
    expect(airport('BRUSSELS')).toBeNull();
    expect(airport('B')).toBeNull();
    expect(airport('')).toBeNull();
    expect(airport(null)).toBeNull();
  });
});

describe('money (Tracking Master §6)', () => {
  it('returns a number, never a formatted string', () => {
    expect(money(1847)).toBe(1847);
    expect(money('1847.00')).toBe(1847);
  });

  it('rounds to cents so floating point never reaches GA4', () => {
    expect(money(1846.9999999999998)).toBe(1847);
    expect(money(10.005)).toBe(10.01);
  });

  it('keeps zero but rejects negative and non-numeric', () => {
    expect(money(0)).toBe(0);
    expect(money(-5)).toBeNull();
    expect(money('€1.847,00')).toBeNull();
    expect(money(undefined)).toBeNull();
  });

  /**
   * `Number(null)` and `Number('')` are both 0 - finite, not negative - so an unresolved
   * total would be reported to Google Ads as a free booking. Caught by the purchase suite,
   * pinned here.
   */
  it('does not turn a missing total into a free one', () => {
    expect(money(null)).toBeNull();
    expect(money('')).toBeNull();
  });
});

describe('count and text', () => {
  it('counts whole non-negative numbers', () => {
    expect(count(2)).toBe(2);
    expect(count('3')).toBe(3);
    expect(count(0)).toBe(0);
    expect(count(-1)).toBeNull();
    expect(count(0, { min: 1 })).toBeNull();
  });

  it('trims text and nulls the empty', () => {
    expect(text('  Antalya ')).toBe('Antalya');
    expect(text('')).toBeNull();
    expect(text('   ')).toBeNull();
    expect(text(null)).toBeNull();
  });
});

describe('hotelId (Tracking Master §10)', () => {
  it('always sends a string, so 12345 and "12345" are one hotel in GA4', () => {
    expect(hotelId(12345)).toBe('12345');
    expect(hotelId('12345')).toBe('12345');
  });

  it('nulls an absent code', () => {
    expect(hotelId(null)).toBeNull();
    expect(hotelId('')).toBeNull();
  });
});

describe('compact (Tracking Master §18)', () => {
  it('drops null, undefined and empty-string keys', () => {
    expect(compact({ a: 1, b: null, c: undefined, d: '' })).toEqual({ a: 1 });
  });

  it('keeps 0 and false, which are real values', () => {
    expect(compact({ children: 0, refundable: false })).toEqual({ children: 0, refundable: false });
  });

  it('recurses into nested objects and arrays', () => {
    const out = compact({
      event: 'purchase',
      hotel_id: null,
      ecommerce: { value: 100, currency: 'EUR', items: [{ item_id: '1', price: null }] },
    });
    expect(out).toEqual({
      event: 'purchase',
      ecommerce: { value: 100, currency: 'EUR', items: [{ item_id: '1' }] },
    });
  });

  it('drops an object that emptied out entirely', () => {
    expect(compact({ a: 1, meta: { x: null } })).toEqual({ a: 1 });
  });
});
