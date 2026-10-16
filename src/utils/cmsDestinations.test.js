import { describe, it, expect } from 'vitest';
import { sectionSearchUrl, destUrl, holidayScopeSearchUrl } from './cmsDestinations';

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

/**
 * "Show all" on a holiday-type page. The page draws COUNTRIES, because a country is listed
 * when any destination inside it carries the type. Searching those countries is a different,
 * much wider question than "every stay of this category", which is what the button promises.
 */
describe('holidayScopeSearchUrl', () => {
  const qs = (url) => new URLSearchParams(String(url).split('?')[1]);

  it('searches the destinations the type resolves to', () => {
    const p = qs(holidayScopeSearchUrl({ destinations: ['BCN', 'AYT'], label: 'Stedentrips' }));
    expect(p.get('destinations')).toBe('BCN,AYT');
    expect(p.get('destinationLabel')).toBe('Stedentrips');
    expect(p.get('transport')).toBe('package');
  });

  it('never sends the type as a themes filter', () => {
    // A holiday type linked at country or destination level sits on no hotel, so themes=
    // intersects to nothing and the page comes back empty. The geography carries the
    // category instead.
    const p = qs(holidayScopeSearchUrl({ destinations: ['BCN'], label: 'Zonvakanties' }));
    expect(p.get('themes')).toBeNull();
    expect(p.get('holidayType')).toBeNull();
  });

  it('never widens to whole countries', () => {
    const p = qs(holidayScopeSearchUrl({ destinations: ['BCN'] }));
    expect(p.get('countries')).toBeNull();
  });

  it('takes the zone code out of a scope zone row', () => {
    // The scope reports { destination, zone }; the results page reads zone codes.
    const p = qs(holidayScopeSearchUrl({ destinations: ['AYT'], zones: [{ destination: 'AYT', zone: 'BEL' }] }));
    expect(p.get('zones')).toBe('BEL');
    expect(p.get('destinations')).toBe('AYT');
  });

  it('is case-insensitive and drops blanks and duplicates', () => {
    const p = qs(holidayScopeSearchUrl({ destinations: ['bcn', 'BCN', '', null, ' ayt '] }));
    expect(p.get('destinations')).toBe('BCN,AYT');
  });

  it('answers null when the type resolves to nowhere, so the caller keeps its own link', () => {
    // Returning a bare /results here would turn "Show all" for one category into a search
    // across the entire site, which is worse than the imperfect link it replaces.
    expect(holidayScopeSearchUrl({ destinations: [], zones: [] })).toBeNull();
    expect(holidayScopeSearchUrl({})).toBeNull();
    expect(holidayScopeSearchUrl()).toBeNull();
  });

  it('leaves hotelCodes out of the URL', () => {
    // A type can carry thousands; they do not fit in a URL. They sit outside the listed
    // destinations, so omitting them narrows rather than widens, which is the safe direction.
    const url = holidayScopeSearchUrl({ destinations: ['AYT'], hotelCodes: ['111', '222'] });
    expect(url).not.toMatch(/hotelCode/i);
    expect(url).not.toMatch(/111/);
  });
});

/**
 * UI-20 (§12B.2). Last Minute and All Inclusive are doors that carry a default with them, so the
 * link says which door was used. Every other holiday type is just a filter and says nothing.
 */
describe('a holiday-type link names the entry it came through', () => {
  const q = (url) => new URLSearchParams(String(url).split('?')[1]);

  it('Last Minute and All Inclusive are named, hyphens and all', () => {
    expect(q(destUrl({ type: 'country', code: 'TR', name: 'Turkije' }, 4, 'last-minute')).get('entry'))
      .toBe('last_minute');
    expect(q(destUrl({ type: 'city', code: 'AYT', name: 'Antalya' }, 9, 'all-inclusive')).get('entry'))
      .toBe('all_inclusive');
  });

  it('any other type carries no entry, so no default is applied behind the traveller', () => {
    expect(q(destUrl({ type: 'country', code: 'TR', name: 'Turkije' }, 4, 'zonvakanties')).get('entry'))
      .toBeNull();
    expect(q(destUrl({ type: 'country', code: 'TR', name: 'Turkije' }, 4)).get('entry')).toBeNull();
  });

  it('"Toon alles" through one of those doors keeps it', () => {
    const url = sectionSearchUrl({ dests: [{ type: 'country', code: 'TR', name: 'Turkije' }], entry: 'last-minute' });
    expect(q(url).get('entry')).toBe('last_minute');
  });

  it('a Show all across several types carries none, because no single door applies', () => {
    const url = sectionSearchUrl({ dests: [{ type: 'country', code: 'TR', name: 'Turkije' }] });
    expect(q(url).get('entry')).toBeNull();
  });
});
