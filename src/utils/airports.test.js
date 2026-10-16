import { describe, it, expect, afterEach } from 'vitest';
import {
  DEPARTURE_AIRPORTS, AIRPORT_CODES, POPULAR_AIRPORTS, OTHER_AIRPORTS,
  DEFAULT_ORIGIN, airportLabel, airportCity, normaliseOrigin, airportToValue,
  setDepartureAirports, getDepartureAirports, isDepartureAirport, parseOrigins, byPopularThenOrder,
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

// What the flight search writes into its From/To fields. The bracketed code is the part the
// rest of the journey reads back (flightData's parseAirport), so the format is a contract,
// not decoration.
describe('airportToValue', () => {
  it('writes city first, then the airport name, then the code', () => {
    expect(airportToValue({ code: 'BRU', city: 'Brussel', name: 'Brussel Nationale Airport' }))
      .toBe('Brussel, Brussel Nationale Airport (BRU)');
  });

  it('does not repeat a place that has no airport name of its own', () => {
    // The curated destination shortlist carries a city and a country, not an airport name.
    expect(airportToValue({ code: 'HRG', city: 'Hurghada', name: '' })).toBe('Hurghada (HRG)');
    expect(airportToValue({ code: 'AYT', city: 'Antalya', name: 'Antalya' })).toBe('Antalya (AYT)');
  });

  it('falls back to whatever it has, and to nothing at all', () => {
    expect(airportToValue({ code: 'LHR', name: 'Heathrow Airport' })).toBe('Heathrow Airport (LHR)');
    expect(airportToValue({ code: 'ZZZ' })).toBe('ZZZ (ZZZ)');
    expect(airportToValue(null)).toBe('');
    expect(airportToValue({})).toBe('');
  });
});

describe('the dashboard list is the authority (spec 3.6)', () => {
  // The registry is module state: put the seed back so later tests see the usual list.
  afterEach(() => setDepartureAirports(DEPARTURE_AIRPORTS));

  it('once loaded, offers exactly the airports the dashboard lists', () => {
    setDepartureAirports([
      { code: 'CRL', name: 'Charleroi, Brussels South', sortOrder: 20 },
      { code: 'ANR', name: 'Antwerp', sortOrder: 10 },
    ]);
    // CRL before ANR despite the higher sortOrder: the dashboard sent no `popular` flag, so
    // each keeps the seed's, and CRL is curated popular while ANR is not (UI-18).
    expect(getDepartureAirports().map((a) => a.code)).toEqual(['CRL', 'ANR']);
    expect(isDepartureAirport('BRU')).toBe(false);   // deactivated: not merged back from the seed
    expect(isDepartureAirport('crl')).toBe(true);
  });

  it('never falls back to an airport the dashboard switched off', () => {
    setDepartureAirports([{ code: 'CRL', sortOrder: 20 }, { code: 'ANR', sortOrder: 10 }]);
    // With BRU switched off the fallback is the first airport on offer, which is now the
    // popular one rather than whichever had the lowest sortOrder.
    expect(normaliseOrigin('BRU')).toBe('CRL');
    expect(normaliseOrigin('JFK')).toBe('CRL');
    expect(normaliseOrigin('CRL')).toBe('CRL');
  });

  it('ignores an empty or broken answer and keeps what it had', () => {
    setDepartureAirports([]);
    setDepartureAirports([{ name: 'no code' }]);
    expect(isDepartureAirport('BRU')).toBe(true);
  });
});

describe('parseOrigins', () => {
  afterEach(() => setDepartureAirports(DEPARTURE_AIRPORTS));

  it('reads origin and origins together, known codes only, de-duplicated', () => {
    expect(parseOrigins('crl', 'BRU,CRL,JFK, ams ')).toEqual(['CRL', 'BRU', 'AMS']);
  });

  it('returns an empty list, meaning No preference, when nothing usable is given', () => {
    expect(parseOrigins(null, undefined, '', 'JFK')).toEqual([]);
  });

  it('drops an airport the dashboard deactivated', () => {
    setDepartureAirports([{ code: 'CRL' }]);
    expect(parseOrigins('BRU,CRL')).toEqual(['CRL']);
  });
});

/**
 * UI-18 (Master §12B.6). Departure lists show the Popular airports first, then the rest in the
 * order configured in GeoData → Airports.
 *
 * ORDER ONLY. The point of the task is that it changes what a traveller reads and nothing else:
 * "No preference" still compares every active departure airport, so the cheapest package may
 * leave from one that is not popular, and marking an airport Popular must never move a price.
 */
describe('popular departure airports come first (UI-18)', () => {
  afterEach(() => setDepartureAirports(DEPARTURE_AIRPORTS));

  const a = (code, popular, sortOrder) => ({ code, name: code, popular, sortOrder });

  it('puts the popular ones above the rest, whatever order they arrive in', () => {
    setDepartureAirports([
      a('LIL', false, 1),
      a('DUS', false, 2),
      a('BRU', true, 10),
      a('CRL', true, 11),
    ]);
    expect(getDepartureAirports().map((x) => x.code)).toEqual(['BRU', 'CRL', 'LIL', 'DUS']);
  });

  it('keeps the configured order within each group', () => {
    // A low sortOrder does not promote a non-popular airport past a popular one, and the
    // dashboard's ordering still decides the sequence inside both halves.
    setDepartureAirports([a('CRL', true, 9), a('BRU', true, 2), a('DUS', false, 1)]);
    expect(getDepartureAirports().map((x) => x.code)).toEqual(['BRU', 'CRL', 'DUS']);
  });

  it('an airport the dashboard says nothing about is not treated as popular', () => {
    setDepartureAirports([{ code: 'ZZZ', name: 'Z' }, a('BRU', true, 5)]);
    expect(getDepartureAirports()[0].code).toBe('BRU');
  });

  it('two airports sharing a sort order keep the same order on every load', () => {
    // Without the code tiebreak they would sit wherever the answer happened to arrive, so a
    // list could silently reshuffle between two visits.
    const once = () => {
      setDepartureAirports([a('DUS', false, 5), a('BRE', false, 5), a('CGN', false, 5)]);
      return getDepartureAirports().map((x) => x.code);
    };
    expect(once()).toEqual(['BRE', 'CGN', 'DUS']);
    expect(once()).toEqual(once());
  });

  it('the comparator itself is total and survives junk', () => {
    expect(byPopularThenOrder({ code: 'A', popular: true }, { code: 'B' })).toBeLessThan(0);
    expect(byPopularThenOrder({ code: 'A' }, { code: 'B', popular: true })).toBeGreaterThan(0);
    expect(byPopularThenOrder({ code: 'A' }, { code: 'A' })).toBe(0);
    expect(() => [undefined, null, { code: 'A' }].sort(byPopularThenOrder)).not.toThrow();
  });

  it('a truthy-but-not-true popular flag is not promoted', () => {
    // The registry normalises to a real boolean; anything else would make the order depend on
    // how the dashboard happened to serialise the field.
    setDepartureAirports([{ code: 'AAA', popular: 'yes', sortOrder: 9 }, a('BRU', true, 9)]);
    expect(getDepartureAirports()[0].code).toBe('BRU');
  });
});
