import { describe, it, expect } from 'vitest';
import { isoDaysFromNow, defaultSearchContext, hotelDetailHref } from './searchDefaults';

describe('isoDaysFromNow', () => {
  it('adds whole days in UTC', () => {
    expect(isoDaysFromNow(30, new Date('2026-01-01T12:00:00Z'))).toBe('2026-01-31');
    expect(isoDaysFromNow(37, new Date('2026-01-01T12:00:00Z'))).toBe('2026-02-07');
  });

  it('crosses month, year and leap-day boundaries', () => {
    expect(isoDaysFromNow(1, new Date('2026-12-31T00:00:00Z'))).toBe('2027-01-01');
    expect(isoDaysFromNow(1, new Date('2028-02-28T00:00:00Z'))).toBe('2028-02-29');   // leap year
    expect(isoDaysFromNow(1, new Date('2027-02-28T00:00:00Z'))).toBe('2027-03-01');   // not one
  });

  it('does not shift a day for a traveller in a positive-offset timezone', () => {
    // 23:30 in Brussels on 1 Jan is 22:30 UTC the same day. Building the date locally and
    // formatting it as UTC is the classic way a check-in lands 24h early.
    expect(isoDaysFromNow(0, new Date('2026-01-01T22:30:00Z'))).toBe('2026-01-01');
    expect(isoDaysFromNow(0, new Date('2026-01-01T00:30:00Z'))).toBe('2026-01-01');
  });
});

describe('defaultSearchContext', () => {
  it('is a seven-night stay thirty days out, for two adults in one room', () => {
    const ctx = defaultSearchContext(new Date('2026-01-01T00:00:00Z'));
    expect(ctx).toEqual({
      checkIn: '2026-01-31', checkOut: '2026-02-07',
      adults: '2', children: '0', rooms: '1', nights: '7',
    });
  });

  it('always spans exactly the advertised number of nights', () => {
    for (const day of ['2026-02-26', '2026-12-30', '2028-02-27']) {
      const ctx = defaultSearchContext(new Date(`${day}T00:00:00Z`));
      const nights = (new Date(`${ctx.checkOut}T00:00:00Z`) - new Date(`${ctx.checkIn}T00:00:00Z`)) / 86400000;
      expect(nights).toBe(Number(ctx.nights));
    }
  });
});

describe('hotelDetailHref', () => {
  const ctx = defaultSearchContext(new Date('2026-01-01T00:00:00Z'));

  it('builds a detail URL carrying the search context', () => {
    const href = hotelDetailHref({ hotelCode: '32243', destinationCode: 'AYT', name: 'Rixos', stars: 5 }, ctx);
    const [path, query] = href.split('?');
    expect(path).toBe('/hotel/32243');
    const q = new URLSearchParams(query);
    expect(q.get('checkIn')).toBe('2026-01-31');
    expect(q.get('destination')).toBe('AYT');
    expect(q.get('name')).toBe('Rixos');
    expect(q.get('stars')).toBe('5');
  });

  it('returns null without a hotelCode, rather than /hotel/undefined', () => {
    expect(hotelDetailHref({ name: 'Nameless' }, ctx)).toBeNull();
    expect(hotelDetailHref({ hotelCode: null }, ctx)).toBeNull();
    expect(hotelDetailHref({ hotelCode: '   ' }, ctx)).toBeNull();
    expect(hotelDetailHref(null, ctx)).toBeNull();
    expect(hotelDetailHref(undefined, ctx)).toBeNull();
  });

  it('accepts a numeric hotelCode', () => {
    expect(hotelDetailHref({ hotelCode: 32243 }, ctx).split('?')[0]).toBe('/hotel/32243');
  });

  it('omits optional fields it was not given', () => {
    const q = new URLSearchParams(hotelDetailHref({ hotelCode: '1' }, ctx).split('?')[1]);
    for (const k of ['destination', 'name', 'img', 'loc', 'stars']) expect(q.get(k)).toBeNull();
  });

  it('escapes values that would otherwise break the URL', () => {
    const href = hotelDetailHref(
      { hotelCode: 'a/b?c', name: 'Sea & Sun #1', loc: 'Málaga, España' }, ctx);
    expect(href.split('?')[0]).toBe('/hotel/a%2Fb%3Fc');
    const q = new URLSearchParams(href.split('?')[1]);
    expect(q.get('name')).toBe('Sea & Sun #1');
    expect(q.get('loc')).toBe('Málaga, España');
  });

  it('trims the whitespace some source names carry', () => {
    const q = new URLSearchParams(
      hotelDetailHref({ hotelCode: '1', name: '  Ana y Jose  ', loc: ' Holbox ' }, ctx).split('?')[1]);
    expect(q.get('name')).toBe('Ana y Jose');
    expect(q.get('loc')).toBe('Holbox');
  });
});
