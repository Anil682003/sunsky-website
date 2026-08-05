import { describe, it, expect } from 'vitest';
import {
  DEPARTURE_AIRPORTS, AIRPORT_CODES, POPULAR_AIRPORTS, OTHER_AIRPORTS,
  DEFAULT_ORIGIN, airportLabel, airportCity, normaliseOrigin,
} from './airports';

describe('the departure-airport list', () => {
  it('has no duplicate codes', () => {
    expect(new Set(AIRPORT_CODES).size).toBe(AIRPORT_CODES.length);
  });

  it('includes the default origin', () => {
    expect(AIRPORT_CODES).toContain(DEFAULT_ORIGIN);
  });

  it('splits cleanly into popular + other', () => {
    expect(POPULAR_AIRPORTS.length + OTHER_AIRPORTS.length).toBe(DEPARTURE_AIRPORTS.length);
    expect(POPULAR_AIRPORTS.map((a) => a.code)).toContain(DEFAULT_ORIGIN);
  });

  // Both halves of the old split — hero's ANR/OST/LGG/LIL and the hotel page's
  // RTM/NRN/DUS — must exist in the merged list, or one screen's pick is again
  // an airport another screen cannot represent.
  it('covers both legacy lists', () => {
    for (const code of ['BRU', 'CRL', 'ANR', 'OST', 'LGG', 'AMS', 'EIN', 'LIL', 'RTM', 'NRN', 'DUS']) {
      expect(AIRPORT_CODES).toContain(code);
    }
  });
});

describe('normaliseOrigin — the URL guard', () => {
  it('accepts a known code, any case, padded', () => {
    expect(normaliseOrigin('AMS')).toBe('AMS');
    expect(normaliseOrigin('ams')).toBe('AMS');
    expect(normaliseOrigin('  eIn ')).toBe('EIN');
  });

  // An unknown airport handed to the supplier verbatim comes back empty with no
  // explanation — it must fall back to the default instead.
  it('falls back to the default for anything not sold', () => {
    expect(normaliseOrigin('JFK')).toBe(DEFAULT_ORIGIN);
    expect(normaliseOrigin('__none__')).toBe(DEFAULT_ORIGIN);
    expect(normaliseOrigin('')).toBe(DEFAULT_ORIGIN);
    expect(normaliseOrigin(null)).toBe(DEFAULT_ORIGIN);
    expect(normaliseOrigin(undefined)).toBe(DEFAULT_ORIGIN);
    expect(normaliseOrigin('<script>')).toBe(DEFAULT_ORIGIN);
  });
});

describe('labels', () => {
  it('resolves a known code and degrades to the code for unknown ones', () => {
    expect(airportLabel('BRU')).toBe('Brussels Airport');
    expect(airportCity('CRL')).toBe('Charleroi');
    expect(airportLabel('XXX')).toBe('XXX');
    expect(airportCity('XXX')).toBe('XXX');
    expect(airportLabel('')).toBe('');
  });
});
