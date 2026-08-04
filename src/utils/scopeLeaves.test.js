import { describe, it, expect } from 'vitest';
import { scopeLeaves, scopeLeafCount, zoneKey, zoneCity } from './scopeLeaves';

// Antalya and Bodrum are Turkish, Malaga is Spanish — the cascade's level-2 list.
const CITIES = [
  { code: 'AYT', name: 'Antalya', countryCode: 'TR' },
  { code: 'BJV', name: 'Bodrum',  countryCode: 'TR' },
  { code: 'AGP', name: 'Malaga',  countryCode: 'ES' },
];

describe('scopeLeaves', () => {
  it('counts a country on its own as one place', () => {
    expect(scopeLeafCount({ countries: ['TR'] }, CITIES)).toBe(1);
  });

  it('does not bill a country and its own city as two places', () => {
    const scope = { countries: ['TR'], destinations: ['AYT'], zones: [] };
    expect(scopeLeafCount(scope, CITIES)).toBe(1);
    expect(scopeLeaves(scope, CITIES)).toEqual({ countries: [], destinations: ['AYT'], zones: [] });
  });

  it('keeps a country that no picked city narrows', () => {
    const scope = { countries: ['TR', 'ES'], destinations: ['AYT'], zones: [] };
    expect(scopeLeaves(scope, CITIES).countries).toEqual(['ES']);
    expect(scopeLeafCount(scope, CITIES)).toBe(2);   // all of Spain + Antalya
  });

  it('does not bill a city and its own area as two places', () => {
    const scope = { countries: ['TR'], destinations: ['AYT'], zones: ['AYT:16'] };
    expect(scopeLeafCount(scope, CITIES)).toBe(1);
    expect(scopeLeaves(scope, CITIES)).toEqual({ countries: [], destinations: [], zones: ['AYT:16'] });
  });

  it('counts each area of a city separately', () => {
    const scope = { countries: ['TR'], destinations: ['AYT'], zones: ['AYT:16', 'AYT:9'] };
    expect(scopeLeafCount(scope, CITIES)).toBe(2);
  });

  it('keeps a sibling city that has no area picked', () => {
    const scope = { countries: ['TR'], destinations: ['AYT', 'BJV'], zones: ['AYT:16'] };
    expect(scopeLeaves(scope, CITIES)).toEqual({
      countries: [], destinations: ['BJV'], zones: ['AYT:16'],
    });
  });

  it('falls back to counting the country while the city list is still loading', () => {
    // No lookup yet → nothing is known to narrow TR, so it still counts. Over-counting for a
    // moment beats claiming a scope covers less than it does.
    expect(scopeLeafCount({ countries: ['TR'], destinations: ['AYT'] }, [])).toBe(2);
  });

  it('treats an empty scope as no places', () => {
    expect(scopeLeafCount({}, CITIES)).toBe(0);
    expect(scopeLeafCount(undefined, undefined)).toBe(0);
  });

  it('keys an area by city and zone, since a zoneCode repeats across cities', () => {
    expect(zoneKey({ destinationCode: 'AYT', zoneCode: 16 })).toBe('AYT:16');
    expect(zoneCity('AYT:16')).toBe('AYT');
  });
});
