// Levent, 12 Nov 2026: a homepage card for Mallorca opened results titled "Majorca, Spain" — the
// names stored when the card was set up. The current GeoData names win, by code.
import { describe, it, expect } from 'vitest';
import { freshDest } from './freshDests';
import { destUrl } from './cmsDestinations';

const byCode = new Map([['PMI', { code: 'PMI', name: 'Mallorca', countryCode: 'ES', countryName: 'Spanje' }]]);
const stored = { type: 'city', code: 'PMI', name: 'Majorca', countryName: 'Spain' };

describe('freshDest', () => {
  it('a city: GeoData name, the country in the reader\'s language', () => {
    expect(freshDest(stored, byCode, 'nl')).toMatchObject({ name: 'Mallorca', countryName: 'Spanje' });
    expect(freshDest(stored, byCode, 'en')).toMatchObject({ name: 'Mallorca', countryName: 'Spain' });
  });
  it('the results label of the card link', () => {
    const label = new URLSearchParams(destUrl(freshDest(stored, byCode, 'nl')).split('?')[1]).get('destinationLabel');
    expect(label).toBe('Mallorca, Spanje');
  });
  it('a country: its name in the reader\'s language; unknown city or no lookup yet: the stored names', () => {
    expect(freshDest({ type: 'country', code: 'ES', name: 'Spain' }, byCode, 'nl').name).toBe('Spanje');
    expect(freshDest({ ...stored, code: 'XXX' }, byCode, 'nl')).toMatchObject({ name: 'Majorca', countryName: 'Spain' });
    expect(freshDest(stored, new Map(), 'nl')).toBe(stored);
  });
});
