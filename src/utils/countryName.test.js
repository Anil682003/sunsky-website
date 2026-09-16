import { describe, it, expect } from 'vitest';
import { countryName } from './countryName';

// The names come from the browser's own CLDR data, so these assert the RULE — when the
// browser is asked and when it is not — rather than a table of translations we maintain.

describe('the name a country is given on screen', () => {
  it('is the reader’s word for it, not the dashboard’s English', () => {
    expect(countryName('ES', 'nl', 'Spain')).toBe('Spanje');
    expect(countryName('GR', 'nl', 'Greece')).toBe('Griekenland');
    expect(countryName('EG', 'nl', 'Egypt')).toBe('Egypte');
  });

  it('translates a country whose English name has since changed', () => {
    // Intl calls TR "Türkiye" in English now. The stored seed still says "Turkey", and a
    // rule that kept anything differing from the English name left this one untranslated.
    expect(countryName('TR', 'nl', 'Turkey')).toBe('Turkije');
  });

  it('gives English back when English is being read', () => {
    expect(countryName('ES', 'en', 'Spain')).toBe('Spain');
    expect(countryName('DO', 'en', 'Dominican Republic')).toBe('Dominican Republic');
  });

  it('accepts a code however it was typed', () => {
    expect(countryName('es', 'nl', 'Spain')).toBe('Spanje');
    expect(countryName('  ES  ', 'nl', 'Spain')).toBe('Spanje');
  });

  // Everything below is the same promise: never rename a row to something wrong. The
  // dashboard's own word is what shows whenever the browser cannot answer properly.
  it('keeps the dashboard’s own name when there is no ISO code', () => {
    expect(countryName('', 'nl', 'Northern Cyprus')).toBe('Northern Cyprus');
    expect(countryName(null, 'nl', 'Northern Cyprus')).toBe('Northern Cyprus');
    expect(countryName(undefined, 'nl', 'Northern Cyprus')).toBe('Northern Cyprus');
  });

  it('keeps it when the code is not a country code', () => {
    expect(countryName('1234', 'nl', 'Somewhere')).toBe('Somewhere');
    expect(countryName('XYZ', 'nl', 'Somewhere')).toBe('Somewhere');
    expect(countryName('E', 'nl', 'Somewhere')).toBe('Somewhere');
  });

  it('refuses ZZ, which resolves to the words "unknown region" rather than failing', () => {
    expect(countryName('ZZ', 'nl', 'Somewhere')).toBe('Somewhere');
    expect(countryName('zz', 'en', 'Somewhere')).toBe('Somewhere');
  });

  it('keeps it for a code the browser has no name for', () => {
    // fallback:'none' returns undefined for an unassigned code rather than echoing the code
    // back, so a row never ends up labelled "AA". (Retired codes are NOT in this bucket:
    // the browser still resolves ZR to Congo-Kinshasa and YU to Servië.)
    expect(countryName('AA', 'nl', 'Somewhere')).toBe('Somewhere');
    expect(countryName('QQ', 'nl', 'Somewhere')).toBe('Somewhere');
  });

  it('falls back to empty rather than undefined when nothing was passed', () => {
    expect(countryName('', 'nl')).toBe('');
    expect(countryName('ZZ', 'nl')).toBe('');
  });
});
