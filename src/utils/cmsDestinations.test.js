import { describe, it, expect } from 'vitest';
import { sectionSearchUrl, destUrl, holidayScopeSearchUrl, dateRangeForHolidayType, groupLinkUrl, linkEntry } from './cmsDestinations';

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

  it('with a slug, sends the type by name and no places, so the Where filter opens empty (Levent 23 Oct)', () => {
    const p = qs(holidayScopeSearchUrl({ destinations: ['BCN', 'AYT'], zones: [{ destination: 'AYT', zone: 'BEL' }], label: 'Zonvakanties', slug: 'zonvakanties' }));
    expect(p.get('holidayType')).toBe('zonvakanties');
    expect(p.get('destinations')).toBeNull();
    expect(p.get('zones')).toBeNull();
    expect(p.get('destinationLabel')).toBe('Zonvakanties');
    expect(p.get('transport')).toBe('package');
    expect(p.get('entry')).toBeNull();
    expect(holidayScopeSearchUrl({ destinations: [], slug: 'zonvakanties' })).toBeNull();
  });

  it('a door type keeps its default entry', () => {
    expect(qs(holidayScopeSearchUrl({ destinations: ['AYT'], slug: 'last-minute' })).get('entry')).toBe('last_minute');
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

  /* A door and a themes filter are two ways of saying the same thing, and only one of them
     works. `themes=` resolves through the countries and destinations a type is linked to, and a
     door is linked to none, so on the live catalogue themes=13 (All Inclusive) matches zero
     hotels. Sent beside the door it does not narrow the search, it empties it. */
  it('a door carries no themes filter, which would empty the search it just opened', () => {
    const lastMinute = q(destUrl({ type: 'country', code: 'TR', name: 'Turkije' }, 12, 'last-minute'));
    expect(lastMinute.get('entry')).toBe('last_minute');
    expect(lastMinute.get('themes')).toBeNull();
    expect(lastMinute.get('countries')).toBe('TR');

    const allIn = q(destUrl({ type: 'city', code: 'AYT', name: 'Antalya' }, 13, 'all-inclusive'));
    expect(allIn.get('entry')).toBe('all_inclusive');
    expect(allIn.get('themes')).toBeNull();
    expect(allIn.get('destinations')).toBe('AYT');
  });

  it('a type linked to countries keeps its filter, which is what narrows Spain to its cities', () => {
    // countries=ES with themes=2 is Spain's city-trip destinations, not Spain entire.
    const p2 = q(destUrl({ type: 'country', code: 'ES', name: 'Spanje' }, 2, 'stedentrips'));
    expect(p2.get('themes')).toBe('2');
    expect(p2.get('entry')).toBeNull();
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

/**
 * A homepage card's own departure window (UI-21, Ch 1 §12B.3).
 *
 * The dashboard stores the dates whether or not the range is switched on, so the flag decides.
 * The window constrains the travel START only: a return may fall after it.
 */
describe('dateRangeForHolidayType', () => {
  const cms = (card) => ({ featuredHolidayTypes: [{ holidayTypeId: 7, title: 'Zonvakanties', ...card }] });

  it('reads an enabled range', () => {
    expect(dateRangeForHolidayType(cms({ enableDateRange: true, startDate: '2027-06-01', endDate: '2027-08-31' }), { id: 7 }))
      .toEqual({ from: '2027-06-01', to: '2027-08-31' });
  });

  it('ignores stored dates when the range is switched off', () => {
    // The acceptance case: "Enable Date Range = NO: stored dates have no effect." The dashboard
    // keeps the dates on the card, so checking for their presence would apply a range nobody
    // turned on.
    expect(dateRangeForHolidayType(cms({ enableDateRange: false, startDate: '2027-06-01', endDate: '2027-08-31' }), { id: 7 })).toBeNull();
    expect(dateRangeForHolidayType(cms({ startDate: '2027-06-01', endDate: '2027-08-31' }), { id: 7 })).toBeNull();
  });

  it('refuses a half-configured or reversed range', () => {
    // Applying one end would narrow the search in a direction nobody chose.
    expect(dateRangeForHolidayType(cms({ enableDateRange: true, startDate: '2027-06-01' }), { id: 7 })).toBeNull();
    expect(dateRangeForHolidayType(cms({ enableDateRange: true, endDate: '2027-08-31' }), { id: 7 })).toBeNull();
    expect(dateRangeForHolidayType(cms({ enableDateRange: true, startDate: '2027-09-01', endDate: '2027-06-01' }), { id: 7 })).toBeNull();
  });

  it('tolerates a full timestamp and no card at all', () => {
    expect(dateRangeForHolidayType(cms({ enableDateRange: true, startDate: '2027-06-01T00:00:00.000Z', endDate: '2027-08-31T00:00:00.000Z' }), { id: 7 }))
      .toEqual({ from: '2027-06-01', to: '2027-08-31' });
    expect(dateRangeForHolidayType(null, { id: 7 })).toBeNull();
    expect(dateRangeForHolidayType(cms({ enableDateRange: true, startDate: '2027-06-01', endDate: '2027-08-31' }), { id: 99 })).toBeNull();
  });
});

describe('a card range travels into the search', () => {
  const qsOf = (url) => new URLSearchParams(String(url).split('?')[1]);
  const RANGE = { from: '2027-06-01', to: '2027-08-31' };

  it('rides a destination link as a START window', () => {
    const p = qsOf(destUrl({ type: 'country', code: 'ES', name: 'Spanje' }, 7, null, RANGE));
    expect(p.get('startFrom')).toBe('2027-06-01');
    expect(p.get('startTo')).toBe('2027-08-31');
    // Not checkIn/checkOut: those would pin one departure day and a fixed return.
    expect(p.get('checkIn')).toBeNull();
    expect(p.get('checkOut')).toBeNull();
  });

  it('rides "Show all" too', () => {
    const p = qsOf(holidayScopeSearchUrl({ destinations: ['AYT'], label: 'Zonvakanties', range: RANGE }));
    expect(p.get('startFrom')).toBe('2027-06-01');
    expect(p.get('startTo')).toBe('2027-08-31');
  });

  it('adds nothing when the card has no range', () => {
    const p = qsOf(destUrl({ type: 'country', code: 'ES', name: 'Spanje' }, 7, null, null));
    expect(p.get('startFrom')).toBeNull();
    expect(p.get('startTo')).toBeNull();
  });
});

/**
 * A popular-destination link carries a DOOR, not a filter, when the dashboard pointed it at
 * Last Minutes or All Inclusive. Both were travelling as filters and that is what made these
 * links slow and empty: holiday type 12 is tagged on no hotel, so themes=12 priced the whole
 * scope and then discarded it, and boards=AI narrowed the all-inclusive card to one board code
 * instead of the AI family. The server applies a door only where the traveller has not already
 * chosen, so sending it costs nothing when they have.
 */
const TYPES = [
  { id: 12, slug: 'last-minute', name: 'Last Minutes' },
  { id: 13, slug: 'all-inclusive', name: 'All Inclusive' },
  { id: 7, slug: 'city-trips', name: 'Stedentrips' },
];

describe('a popular-destination link opens the door the dashboard chose', () => {
  it('sends the Last Minutes type as entry=last_minute and not as a theme', () => {
    const q = params(groupLinkUrl({ dest: country('ES'), label: 'Last Minute Spanje', holidayTypeId: 12 }, TYPES));
    expect(q.get('entry')).toBe('last_minute');
    expect(q.get('themes')).toBeNull();
    expect(q.get('countries')).toBe('ES');
    expect(q.get('destinationLabel')).toBe('Last Minute Spanje');
  });

  it('sends an All Inclusive board as entry=all_inclusive, dropping boards=AI so the whole AI family stays', () => {
    const q = params(groupLinkUrl({ dest: country('TR'), label: 'Turkije All Inclusive', boardCode: 'AI' }, TYPES));
    expect(q.get('entry')).toBe('all_inclusive');
    expect(q.get('boards')).toBeNull();
    expect(q.get('countries')).toBe('TR');
  });

  it('recognises the All Inclusive holiday type too, not only the board', () => {
    const q = params(groupLinkUrl({ dest: country('EG'), holidayTypeId: 13 }, TYPES));
    expect(q.get('entry')).toBe('all_inclusive');
    expect(q.get('themes')).toBeNull();
  });

  it('leaves an ordinary holiday type as the theme filter it is', () => {
    const q = params(groupLinkUrl({ dest: city('PAR'), holidayTypeId: 7 }, TYPES));
    expect(q.get('themes')).toBe('7');
    expect(q.get('entry')).toBeNull();
  });

  it('keeps a board that is not all-inclusive, beside its door', () => {
    const q = params(groupLinkUrl({ dest: country('ES'), boardCode: 'HB', holidayTypeId: 12 }, TYPES));
    expect(q.get('entry')).toBe('last_minute');
    expect(q.get('boards')).toBe('HB');
  });

  it('changes nothing when the catalogue has not loaded, rather than guessing from an id', () => {
    const q = params(groupLinkUrl({ dest: country('ES'), holidayTypeId: 12 }, null));
    expect(q.get('themes')).toBe('12');
    expect(q.get('entry')).toBeNull();
  });

  it('does not treat a type merely NAMED like a door as one: only the slug counts', () => {
    const q = params(groupLinkUrl({ dest: country('ES'), holidayTypeId: 99 }, [
      { id: 99, slug: 'last-minute-deals', name: 'Last Minute' },
    ]));
    expect(q.get('entry')).toBeNull();
    expect(q.get('themes')).toBe('99');
  });

  it('still returns null for a link with nothing to filter by', () => {
    expect(groupLinkUrl({ label: 'Bali' }, TYPES)).toBeNull();
    expect(groupLinkUrl('Bali', TYPES)).toBeNull();
  });

  it('linkEntry reads the slug, the board, or neither', () => {
    expect(linkEntry({ holidayTypeId: 12 }, TYPES)).toBe('last_minute');
    expect(linkEntry({ boardCode: 'ai' }, TYPES)).toBe('all_inclusive');
    expect(linkEntry({ boardCode: 'HB', holidayTypeId: 7 }, TYPES)).toBeNull();
    expect(linkEntry({}, TYPES)).toBeNull();
  });
});
