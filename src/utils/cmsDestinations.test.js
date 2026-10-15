import { describe, it, expect } from 'vitest';
import { sectionSearchUrl, destUrl } from './cmsDestinations';

/**
 * The search behind every "Show all": one results link for every place a section shows. These
 * pin what it may and may not carry, because the results page reads each param literally.
 */

const country = (code) => ({ type: 'country', code });
const city = (code) => ({ type: 'city', code });
const params = (url) => new URL(url, 'https://example.test').searchParams;

describe('sectionSearchUrl', () => {
  it('searches every place at once, countries and cities in their own params', () => {
    const url = sectionSearchUrl({ dests: [city('tfs'), city('LPA'), country('es')] });
    expect(url.startsWith('/results?')).toBe(true);
    expect(params(url).get('destinations')).toBe('TFS,LPA');
    expect(params(url).get('countries')).toBe('ES');
  });

  it('lists a place once, however often the section shows it', () => {
    const url = sectionSearchUrl({ dests: [city('PMI'), city('pmi'), city(' PMI ')] });
    expect(params(url).get('destinations')).toBe('PMI');
  });

  it('skips entries that cannot be searched', () => {
    const url = sectionSearchUrl({ dests: [null, {}, { type: 'city' }, { type: 'zone', code: 'X' }, city('AYT')] });
    expect(params(url).get('destinations')).toBe('AYT');
    expect(params(url).has('countries')).toBe(false);
  });

  it('names the place in the results heading when given a label', () => {
    const url = sectionSearchUrl({ dests: [city('TFS'), city('LPA')], label: 'Spanje' });
    expect(params(url).get('destinationLabel')).toBe('Spanje');
    expect(params(sectionSearchUrl({ dests: [city('TFS')] })).has('destinationLabel')).toBe(false);
  });

  // A holiday type such as All inclusive is tagged on no hotel, and one in the query empties the
  // whole search, so the link carries places and nothing that could filter them away.
  it('carries places only, never a filter (and Flight + Hotel, like every homepage link)', () => {
    const url = sectionSearchUrl({ dests: [country('TR')], themes: [13], boards: ['AI'] });
    expect([...params(url).keys()]).toEqual(['countries', 'transport']);
    expect(params(url).get('transport')).toBe('package');
  });

  it('returns null when no place is linked, so no dead button renders', () => {
    expect(sectionSearchUrl()).toBeNull();
    expect(sectionSearchUrl({ dests: [] })).toBeNull();
    expect(sectionSearchUrl({ dests: [{ name: 'Sri Lanka' }], label: 'Verre reizen' })).toBeNull();
  });
});

describe('destUrl: a destination reached through a holiday type', () => {
  it('carries the holiday type, so the results open with it applied (Zonvakanties → Turkije)', () => {
    const qs = new URLSearchParams(destUrl({ type: 'country', code: 'TR', name: 'Turkije' }, 1).split('?')[1]);
    expect(qs.get('countries')).toBe('TR');
    expect(qs.get('themes')).toBe('1');
  });
  it('without a holiday type, no themes filter', () => {
    const qs = new URLSearchParams(destUrl({ type: 'city', code: 'IST', name: 'Istanbul' }).split('?')[1]);
    expect(qs.get('destinations')).toBe('IST');
    expect(qs.get('themes')).toBeNull();
  });
});
