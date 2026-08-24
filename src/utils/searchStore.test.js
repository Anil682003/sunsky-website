import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveSearch,
  loadSearch,
  clearSearch,
  purgeSearch,
  hasSearchParams,
  SEARCH_TTL_MS,
} from './searchStore';

const iso = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const A_TRIP = {
  mode: 'package',
  countries: [{ id: 7, code: 'TR', name: 'Turkey' }],
  places: [{ type: 'city', code: 'AYT', name: 'Antalya', countryId: 7 }],
  date: iso(30),
  flexDays: 2,
  duration: '6-10 days',
  transport: 'package',
  origins: ['BRU', 'CRL'],
};

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('remembering the last search', () => {
  it('gives the trip back the way it was searched', () => {
    saveSearch(A_TRIP);
    const back = loadSearch();

    expect(back.countries).toEqual([{ id: 7, code: 'TR', name: 'Turkey' }]);
    expect(back.places[0]).toMatchObject({ type: 'city', code: 'AYT', name: 'Antalya' });
    expect(back.date).toBe(A_TRIP.date);
    expect(back.flexDays).toBe(2);
    expect(back.duration).toBe('6-10 days');
    expect(back.origins).toEqual(['BRU', 'CRL']);
    expect(back.transport).toBe('package');
  });

  it('remembers a flights-only search under its own mode', () => {
    saveSearch({
      mode: 'flight',
      flightFrom: 'Brussels (BRU)',
      flightTo: 'Antalya (AYT)',
      flightDate: iso(20),
      flightReturnDate: iso(27),
      cabinClass: 'Business',
      tripType: 'roundtrip',
      directOnly: true,
    });
    const back = loadSearch();

    expect(back.mode).toBe('flight');
    expect(back.flightTo).toBe('Antalya (AYT)');
    expect(back.cabinClass).toBe('Business');
    expect(back.directOnly).toBe(true);
  });

  it('works for a guest — nothing here needs an account', () => {
    // The whole record lives in the browser, so there is no signed-in path to take.
    saveSearch(A_TRIP);
    expect(localStorage.getItem('sunsky.lastSearch')).toBeTruthy();
    expect(loadSearch()).not.toBeNull();
  });
});

describe('the week', () => {
  it('survives six days away', () => {
    saveSearch(A_TRIP);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 24 * 60 * 60 * 1000);
    expect(loadSearch()).not.toBeNull();
  });

  it('is gone after seven, and deleted rather than just ignored', () => {
    saveSearch(A_TRIP);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + SEARCH_TTL_MS + 1000);

    expect(loadSearch()).toBeNull();
    expect(localStorage.getItem('sunsky.lastSearch')).toBeNull();
  });

  it('starts the week again on each search', () => {
    saveSearch(A_TRIP);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 24 * 60 * 60 * 1000);
    saveSearch(A_TRIP);                                   // searched again on day six
    vi.setSystemTime(Date.now() + 6 * 24 * 60 * 60 * 1000); // …twelve days after the first
    expect(loadSearch()).not.toBeNull();
  });

  it('treats a record with no timestamp as expired', () => {
    localStorage.setItem('sunsky.lastSearch', JSON.stringify(A_TRIP)); // no `at`
    expect(loadSearch()).toBeNull();
  });
});

describe('a date that has since passed', () => {
  it('comes back empty while the rest of the trip survives', () => {
    saveSearch({ ...A_TRIP, date: iso(-3) });
    const back = loadSearch();

    expect(back.date).toBe('');                            // not a trip anyone can take
    expect(back.countries[0].code).toBe('TR');             // but where they wanted to go stands
    expect(back.origins).toEqual(['BRU', 'CRL']);
  });

  it('keeps today, which is still bookable', () => {
    saveSearch({ ...A_TRIP, date: iso(0) });
    expect(loadSearch().date).toBe(iso(0));
  });

  it('drops a return date that has passed', () => {
    saveSearch({ mode: 'flight', flightTo: 'AYT', flightDate: iso(5), flightReturnDate: iso(-1) });
    const back = loadSearch();
    expect(back.flightDate).toBe(iso(5));
    expect(back.flightReturnDate).toBe('');
  });
});

describe('what is refused', () => {
  it('does not store a search with neither a destination nor a date', () => {
    expect(saveSearch({ mode: 'package', countries: [], places: [], date: '' })).toBeNull();
    expect(loadSearch()).toBeNull();
  });

  it('leaves an existing record alone when handed rubbish', () => {
    saveSearch(A_TRIP);
    saveSearch(null);
    saveSearch({});
    expect(loadSearch().countries[0].code).toBe('TR');
  });

  it('drops junk out of the lists rather than restoring it', () => {
    saveSearch({
      ...A_TRIP,
      countries: [{ code: 'TR', name: 'Turkey' }, null, { name: 'no code' }],
      places: [{ type: 'city', code: 'AYT', name: 'Antalya' }, { type: 'beach', code: 'X' }],
      origins: ['BRU', 'toolong', 'crl', 42],
    });
    const back = loadSearch();

    expect(back.countries).toHaveLength(1);
    expect(back.places).toHaveLength(1);                   // 'beach' is not a place we search
    expect(back.origins).toEqual(['BRU', 'CRL']);          // case fixed, nonsense dropped
  });

  it('keeps only the fields the picker needs, not whatever the modal was holding', () => {
    saveSearch({
      ...A_TRIP,
      countries: [{ id: 7, code: 'TR', name: 'Turkey', hotelCount: 812, expanded: true, children: [1, 2] }],
    });
    expect(Object.keys(loadSearch().countries[0]).sort()).toEqual(['code', 'id', 'name']);
  });

  it('refuses a flex window outside the range the calendar offers', () => {
    saveSearch({ ...A_TRIP, flexDays: 99 });
    expect(loadSearch().flexDays).toBe(0);
  });

  it('survives a hand-edited record without throwing', () => {
    localStorage.setItem('sunsky.lastSearch', 'not json at all');
    expect(() => loadSearch()).not.toThrow();
    expect(loadSearch()).toBeNull();
  });
});

describe('a link always wins', () => {
  it('recognises a query string that already describes a search', () => {
    expect(hasSearchParams(new URLSearchParams('destination=AYT&checkIn=2026-09-01'))).toBe(true);
    expect(hasSearchParams(new URLSearchParams('countries=TR'))).toBe(true);
    expect(hasSearchParams(new URLSearchParams(''))).toBe(false);
    expect(hasSearchParams(null)).toBe(false);
  });
});

describe('housekeeping', () => {
  it('clearSearch forgets the trip', () => {
    saveSearch(A_TRIP);
    clearSearch();
    expect(loadSearch()).toBeNull();
  });

  it('purgeSearch reports whether it removed anything', () => {
    expect(purgeSearch()).toBe(false);
    saveSearch(A_TRIP);
    expect(purgeSearch()).toBe(false);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + SEARCH_TTL_MS + 1);
    expect(purgeSearch()).toBe(true);
  });

  it('does not carry the party — that belongs to paxStore and its shorter window', () => {
    saveSearch({ ...A_TRIP, adults: 2, children: 1, childDobs: '2015-03-12' });
    const stored = JSON.parse(localStorage.getItem('sunsky.lastSearch'));

    expect(stored.childDobs).toBeUndefined();
    expect(stored.adults).toBeUndefined();
    expect(stored.children).toBeUndefined();
  });
});
