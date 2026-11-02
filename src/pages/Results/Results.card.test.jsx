// The result card as the client approved it (UI changes, Nov 2026, "Result list" 1-4): the guest
// rating at the top of the price column, the trip under it, the from-price large and centred,
// the orange button, and nothing the cached offer does not carry. Both products share the one
// design; each shows only what is its own.
//
// (Dutch: `src/test/setup.js` loads the real i18n, which starts on the site's own language.)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Results from './Results';

vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => vi.fn() }));
vi.mock('react-redux', () => ({ useSelector: (fn) => fn({ auth: { isAuthenticated: false } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
// The page's CMS config (the heading) goes through axios. Answered empty here: unanswered, it
// fails as a network error after the test has finished and is reported against the file.
const axiosPost = vi.fn(() => Promise.resolve({ data: {} }));
vi.mock('../../services/axiosInstance', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: {} })), post: (...a) => axiosPost(...a) },
}));
vi.mock('../../api', () => ({
  fetchFavouriteCodes: vi.fn(() => Promise.resolve(new Set())),
  addFavourite: vi.fn(), removeFavourite: vi.fn(),
}));
// The Hotel only sweep for hotels the cache has no price for (they get "Price on request").
const unpriced = { list: [] };
vi.mock('../../api/unpricedHotels', () => ({ fetchUnpricedHotels: vi.fn(() => Promise.resolve(unpriced.list)) }));
const EMPTY_FACETS = {
  holiday: [], stars: [], facilities: [], activities: [],
  accommodation: [], kids: [], beachDistance: [], centreDistance: [],
};
const answers = { packages: [] };
vi.mock('../../api/filters', () => ({
  fetchFacets: vi.fn(() => Promise.resolve({
    scope: { countries: [], destinations: ['AYT'], hotelCount: 0 },
    matchedDestinations: ['AYT'],
    included: { hotelCodes: false, attributes: false },
    facets: EMPTY_FACETS,
  })),
  fetchCountries: vi.fn(() => Promise.resolve([{ code: 'TR', name: 'Turkey' }])),
  fetchDestinations: vi.fn(() => Promise.resolve([])),
  fetchZones: vi.fn(() => Promise.resolve([])),
  fetchDestinationCountries: vi.fn(() => Promise.resolve([])),
  fetchArrivalAirports: vi.fn(() => Promise.resolve([])),
  fetchDepartureAirports: vi.fn(() => Promise.resolve({ airports: [], filtered: null, cacheHasData: false })),
  fetchPackages: vi.fn((body) => Promise.resolve({
    hotels: answers.packages, hasMore: false,
    destinationStatus: Object.fromEntries(body.destinations.map((d) => [d, { status: 'FEASIBLE' }])),
    boardFacets: {},
  })),
  fetchThemes: vi.fn(() => Promise.resolve([])),
  searchDestinationsAndHotels: vi.fn(() => Promise.resolve({ destinations: [], hotels: [] })),
  fetchMatchingHotels: vi.fn(() => Promise.resolve({ count: 0, hotelCodes: [], attributes: {} })),
}));

// hotelCode → what the bulk hotel-info record adds beyond its name (review, rating, type).
const info = { byCode: {} };
// The stored TripAdvisor review as /hotels/bulk serves it: the raw 5-point rate, the stored
// 10-point score and the count. 6.8 is "Prima".
const REVIEW = { rate: 3.4, rating10: 6.8, count: 588, type: 'TRIPADVISOR', outOf: 5 };

const row = (code, totalAmount, extra = {}) => ({
  hotelCode: code, totalAmount, totalAmountUnrounded: totalAmount, perPerson: totalAmount / 2,
  boardCode: 'AI', roomType: 'DBL', classification: 'NOR', refundable: true, currency: 'EUR', nightlyBreakdown: [], ...extra,
});
// One direction of a cached package flight, as the admin's package engine sends it: its own stop
// count and the fare's hold allowance ({ checkedKg, checkedPieces } from the feed's bag1Weight).
const DIRECT_20KG = { stops: 0, baggage: { checkedKg: 20, checkedPieces: null, raw: '20KG' } };
const pkg = (code, total, flight = {}, extra = {}) => ({
  hotelCode: code, destination: 'AYT', sunskyPayableTotal: total, sunskyPayableTotalRounded: Math.ceil(total),
  pricePerPerson: Math.ceil(Math.ceil(total) / 2), currency: 'EUR', board: 'AI', room: 'DBL',
  stay: { checkin: '2026-11-04', checkout: '2026-11-10', nights: 6 }, departureAirport: 'DUS',
  components: { flight: 400, hotel: total - 400 },
  flight: {
    travelDays: 8,
    outbound: { departureLocal: '2026-11-03T19:00', ...DIRECT_20KG },
    inbound: { departureLocal: '2026-11-10T10:30', ...DIRECT_20KG },
    ...flight,
  },
  ...extra,
});

let ROWS;
beforeEach(() => {
  ROWS = [];
  answers.packages = [];
  unpriced.list = [];
  info.byCode = {};
  globalThis.fetch = vi.fn((url, opts) => {
    const u = String(url);
    if (u.includes('/hotels/bulk')) {
      const codes = JSON.parse(opts?.body || '{}').hotelCodes || [];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: codes.map((c) => ({ hotelCode: c, name: `Hotel ${c}`, images: [], ...(info.byCode[c] || {}) })) }) });
    }
    if (u.endsWith('/contracts/destinations')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 1, destinations: [{ code: 'AYT' }] }) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ nights: 7, count: ROWS.length, total: ROWS.length, results: ROWS, cheapest: ROWS[0] ?? null, hasMore: false, boardFacets: {} }) });
  });
});

const HOTEL_ONLY = '/results?destination=AYT&destinationLabel=Antalya&checkIn=2026-12-15&checkOut=2026-12-22&adults=2&children=0&rooms=1&transport=hotel_only';
const PACKAGE = '/results?destination=AYT&destinationLabel=Antalya&checkIn=2026-11-03&checkOut=2026-11-10&adults=2&children=0&rooms=1&transport=package';
const renderAt = (url) => render(<MemoryRouter initialEntries={[url]}><Results /></MemoryRouter>);
// The card once its hotel-info record is in (the name on it is the record's).
const cardOf = async (code, name = `Hotel ${code}`) => {
  await screen.findByText(name);
  return (await screen.findAllByRole('article')).find((a) => a.querySelector(`a[href*="/hotel/${code}"]`));
};
const rail = (card) => card.querySelector('[class*="rcPriceRail"]');
const liveCalls = () => axiosPost.mock.calls.filter(([u]) => /hotel-availability|flight-availability\/search/.test(String(u)));

describe('the guest rating at the top of the price column', () => {
  it('prints the word, the score out of 10 and the count, from the stored review, above the date', async () => {
    info.byCode['301'] = { review: REVIEW, rating: { kind: 'star', value: 5 } };
    answers.packages = [pkg('301', 1100.4)];
    renderAt(PACKAGE);
    const card = await cardOf('301');
    const text = card.textContent;
    expect(text).toMatch(/Prima/);
    expect(text).toMatch(/6\.8\/10/);
    expect(text).toMatch(/588 beoordelingen/);
    // Rating first, then the travel date, in the one column.
    expect(text.indexOf('Prima')).toBeLessThan(text.indexOf('3 nov 2026'));
    expect(rail(card).firstElementChild.className).toMatch(/rcReviewBox/);
    // Stars stay in the middle column, apart from the guest score.
    expect(card.querySelector('[class*="rcContent"] [class*="rcRating"]')).not.toBeNull();
    expect(rail(card).querySelector('[class*="rcRating"]')).toBeNull();
  });

  it('writes the count the way the language does (1.024, not 1,024)', async () => {
    info.byCode['301'] = { review: { ...REVIEW, count: 1024 } };
    answers.packages = [pkg('301', 1100.4)];
    renderAt(PACKAGE);
    const card = await cardOf('301');
    expect(card.textContent).toMatch(/1\.024 beoordelingen/);
  });

  it('no review at all: no block, no placeholder, and the travel date takes the top', async () => {
    answers.packages = [pkg('301', 1100.4)];
    renderAt(PACKAGE);
    const card = await cardOf('301');
    expect(card.textContent).not.toMatch(/\/10|beoordeling|Prima|Goed|Uitstekend|Redelijk/);
    expect(card.querySelector('[class*="rcReviewBox"]')).toBeNull();
    expect(rail(card).firstElementChild.className).toMatch(/rcTrip/);
  });

  it('a score without a review count shows nothing, and so does a count without a valid score', async () => {
    info.byCode['301'] = { review: { ...REVIEW, count: 0 } };
    info.byCode['302'] = { review: { ...REVIEW, rate: 0, rating10: 0 } };
    answers.packages = [pkg('301', 1100.4), pkg('302', 1200)];
    renderAt(PACKAGE);
    const a = await cardOf('301');
    const b = await cardOf('302');
    for (const card of [a, b]) {
      expect(card.textContent).not.toMatch(/\/10|beoordeling|Prima/);
      expect(card.querySelector('[class*="rcReviewBox"]')).toBeNull();
    }
  });
});

describe('the hotel: board and accommodation chips, the facilities row', () => {
  it('a green board chip and a grey type chip, the type from the property\'s classification', async () => {
    // Hotelbeds rates apartments in keys: that classification is the type, read the other way.
    info.byCode['301'] = { rating: { kind: 'key', value: 3 } };
    info.byCode['302'] = { rating: { kind: 'star', value: 5 }, name: 'Insotel Punta Prima' };
    answers.packages = [pkg('301', 1100.4), pkg('302', 1200)];
    renderAt(PACKAGE);
    const apt = await cardOf('301');
    const hotel = await cardOf('302', 'Insotel Punta Prima');
    expect(within(apt).getByText('All inclusive').className).toMatch(/rcChipBoard/);
    expect(within(apt).getByText('Appartement').className).toMatch(/rcChipType/);
    expect(within(hotel).getByText('Hotel').className).toMatch(/rcChipType/);
  });

  it('names the accommodation type the record carries, and never leaks an unknown code', async () => {
    info.byCode['301'] = { accommodationTypeCode: 'V' };
    info.byCode['302'] = { accommodationTypeCode: 'ZZ' };
    answers.packages = [pkg('301', 1100.4), pkg('302', 1200)];
    renderAt(PACKAGE);
    const villa = await cardOf('301');
    const unknown = await cardOf('302');
    expect(within(villa).getByText('Villa').className).toMatch(/rcChipType/);
    expect(unknown.textContent).not.toMatch(/ZZ/);
    expect(unknown.querySelector('[class*="rcChipType"]')).toBeNull();
  });

  it('no board and no classification: no chip row at all, and never the room type', async () => {
    ROWS = [row('201', 501, { boardCode: '' })];
    renderAt(HOTEL_ONLY);
    const card = await cardOf('201');
    expect(card.querySelector('[class*="rcChips"]')).toBeNull();
    expect(card.textContent).not.toMatch(/Tweepersoons|DBL/);
  });

  it('names the country in full, never its code, and shows no "+N more" after the facilities', async () => {
    // Seven guest-facing amenities: five fill the row, the two over are simply not there.
    const seven = ['Swimming pool', 'Wi-fi', 'Sauna', 'Gym', 'Restaurant', 'Bar', 'Car park']
      .map((facilityName, i) => ({ facilityCode: i + 1, facilityGroupCode: 70, facilityName }));
    info.byCode['301'] = { countryCode: 'ID', cityName: 'Bali', zoneName: 'Terunyan', facilities: seven };
    answers.packages = [pkg('301', 1100.4)];
    renderAt(PACKAGE);
    const card = await cardOf('301');
    const place = card.querySelector('[class*="rcPlace"]');
    expect(place.textContent).toBe('Terunyan·Bali·Indonesië');   // the dots are their own spans
    expect(card.querySelectorAll('[class*="rcFacts"] > span')).toHaveLength(5);
    expect(card.textContent).not.toMatch(/\+2 meer|\+\d+ more/);
  });

  it('keeps the facilities with their icons', async () => {
    info.byCode['301'] = { facilities: [{ facilityCode: 1, facilityGroupCode: 70, name: 'Swimming pool', facilityName: 'Swimming pool' }] };
    answers.packages = [pkg('301', 1100.4)];
    renderAt(PACKAGE);
    const card = await cardOf('301');
    const facts = card.querySelector('[class*="rcFacts"]');
    expect(facts).not.toBeNull();
    expect(facts.querySelector('svg')).not.toBeNull();
  });
});

describe('the Flight + Hotel card', () => {
  it('the trip date with its year and length, the airport that priced it, the label, the centred p.p. price and the button', async () => {
    answers.packages = [pkg('301', 1100.4)];
    renderAt(PACKAGE);
    const card = await cardOf('301');
    const text = card.textContent;
    expect(text).toMatch(/3 nov 2026/);                  // the outbound flight's date, not the 4 Nov check-in
    expect(text).toMatch(/\(8 dagen\)/);
    expect(text).not.toMatch(/4 nov/);
    expect(text).toMatch(/Vanaf Düsseldorf \(DUS\)/);
    expect(text).toMatch(/Vlucht \+ hotel vanaf/);
    expect(text).toMatch(/€551p\.p\./);                  // 1101 for two is 551 each
    expect(within(card).getByRole('link', { name: /bekijk vakantie/i })).toHaveAttribute('href', expect.stringContaining('/hotel/301'));
    // Not the party, not its total, not the flight times.
    expect(text).not.toMatch(/volwassen|kind|1\.101|19:00|10:30|per persoon/);
    expect(liveCalls()).toHaveLength(0);                 // cache data only
  });

  it('"Rechtstreeks" only when the outbound AND the return are direct', async () => {
    answers.packages = [
      pkg('301', 1100),
      pkg('302', 1100, { outbound: { departureLocal: '2026-11-03T19:00', stops: 1, baggage: null }, inbound: { departureLocal: '2026-11-10T10:30', ...DIRECT_20KG } }),
      pkg('303', 1100, { outbound: { departureLocal: '2026-11-03T19:00', ...DIRECT_20KG }, inbound: { departureLocal: '2026-11-10T10:30', stops: 1, baggage: null } }),
    ];
    renderAt(PACKAGE);
    expect((await cardOf('301')).textContent).toMatch(/Rechtstreeks/);
    expect((await cardOf('302')).textContent).not.toMatch(/Rechtstreeks/);
    expect((await cardOf('303')).textContent).not.toMatch(/Rechtstreeks/);
  });

  it('an offer that states no routing earns no pill; the engine\'s combined count of 0 does', async () => {
    answers.packages = [
      // Neither direction says, and no combined count: nothing is claimed.
      pkg('301', 1100, { outbound: { departureLocal: '2026-11-03T19:00' }, inbound: { departureLocal: '2026-11-10T10:30' } }),
      // The combined `stops` is the two directions added up, so 0 is direct both ways.
      pkg('302', 1100, { stops: 0, outbound: { departureLocal: '2026-11-03T19:00' }, inbound: { departureLocal: '2026-11-10T10:30' } }),
      // Legs count too: one leg out, two back.
      pkg('303', 1100, { outbound: { departureLocal: '2026-11-03T19:00', legs: [{ from: 'DUS', to: 'AYT' }] }, inbound: { departureLocal: '2026-11-10T10:30', legs: [{ from: 'AYT', to: 'IST' }, { from: 'IST', to: 'DUS' }] } }),
    ];
    renderAt(PACKAGE);
    expect((await cardOf('301')).textContent).not.toMatch(/Rechtstreeks/);
    expect((await cardOf('302')).textContent).toMatch(/Rechtstreeks/);
    expect((await cardOf('303')).textContent).not.toMatch(/Rechtstreeks/);
  });

  it('baggage lines only when the fares include it for the whole journey, "inbegrepen" in green', async () => {
    answers.packages = [
      pkg('301', 1100),   // 20 kg out and back
      // The return fare says nothing about baggage: neither line.
      pkg('302', 1100, { outbound: { departureLocal: '2026-11-03T19:00', ...DIRECT_20KG }, inbound: { departureLocal: '2026-11-10T10:30', stops: 0 } }),
      // The return fare says "0": neither line.
      pkg('303', 1100, { outbound: { departureLocal: '2026-11-03T19:00', ...DIRECT_20KG }, inbound: { departureLocal: '2026-11-10T10:30', stops: 0, baggage: { checkedKg: 0, checkedPieces: 0, raw: '0' } } }),
      // Pieces count as much as kilos.
      pkg('304', 1100, { outbound: { departureLocal: '2026-11-03T19:00', stops: 0, baggage: { checkedKg: null, checkedPieces: 1, raw: '1PC' } }, inbound: { departureLocal: '2026-11-10T10:30', stops: 0, baggage: { checkedKg: null, checkedPieces: 1, raw: '1PC' } } }),
    ];
    renderAt(PACKAGE);
    const both = await cardOf('301');
    expect(both.textContent).toMatch(/Handbagage inbegrepen/);
    expect(both.textContent).toMatch(/Ruimbagage inbegrepen/);
    for (const word of within(both).getAllByText('inbegrepen')) expect(word.className).toMatch(/rcIncludedWord/);
    expect((await cardOf('302')).textContent).not.toMatch(/bagage/i);
    expect((await cardOf('303')).textContent).not.toMatch(/bagage/i);
    expect((await cardOf('304')).textContent).toMatch(/Ruimbagage inbegrepen/);
  });

  it('a stated cabin allowance earns the cabin line on its own', async () => {
    const cabinOnly = { stops: 0, baggage: { checkedKg: 0, checkedPieces: 0, handKg: 8, raw: '0' } };
    answers.packages = [pkg('301', 1100, { outbound: { departureLocal: '2026-11-03T19:00', ...cabinOnly }, inbound: { departureLocal: '2026-11-10T10:30', ...cabinOnly } })];
    renderAt(PACKAGE);
    const card = await cardOf('301');
    expect(card.textContent).toMatch(/Handbagage inbegrepen/);
    expect(card.textContent).not.toMatch(/Ruimbagage/);
  });
});

describe('the Hotel Only card', () => {
  it('the check-in date and stay length, "Hotel vanaf", the centred p.p. price, and nothing about flights', async () => {
    ROWS = [row('201', 501)];
    renderAt(HOTEL_ONLY);
    const card = await cardOf('201');
    const text = card.textContent;
    expect(text).toMatch(/15 dec 2026/);                 // the searched check-in
    expect(text).toMatch(/\(8 dagen\)/);                 // 7 nights, counted in days like the filter beside it
    expect(text).toMatch(/Hotel vanaf/);
    expect(text).toMatch(/€251p\.p\./);                  // 501 for two
    expect(within(card).getByRole('link', { name: /bekijk vakantie/i })).toHaveAttribute('href', expect.stringContaining('/hotel/201'));
    expect(text).not.toMatch(/Vanaf [A-Z]|Rechtstreeks|bagage|Vlucht|volwassen|per persoon|501/i);
    expect(card.querySelector('[class*="rcDirectPill"]')).toBeNull();
    expect(card.querySelector('[class*="rcBags"]')).toBeNull();
  });

  it('names the stay the cache priced when the row carries one (flexible dates)', async () => {
    ROWS = [row('201', 501, { nightlyBreakdown: [{ date: '2026-12-16' }, { date: '2026-12-17' }, { date: '2026-12-18' }] })];
    renderAt(HOTEL_ONLY);
    const card = await cardOf('201');
    expect(card.textContent).toMatch(/16 dec 2026/);
    expect(card.textContent).toMatch(/\(4 dagen\)/);
  });

  it('a hotel without a cached price keeps its prompt and its live-price button, with no from-price label', async () => {
    ROWS = [row('201', 501)];
    unpriced.list = [{ hotelCode: '202', boardCode: 'AI', roomName: 'Double', refundable: true }];
    renderAt(HOTEL_ONLY);
    const card = await cardOf('202');
    expect(card.textContent).toMatch(/Prijs op aanvraag/);
    // "Hotel vanaf" belongs to a figure; a prompt gets no label and no "p.p.".
    expect(card.textContent).not.toMatch(/Hotel vanaf|p\.p\./);
    expect(within(card).getByRole('link', { name: /actuele prijzen/i })).toHaveAttribute('href', expect.stringContaining('/hotel/202'));
    // Its date is still the searched stay: the one the live check will price.
    expect(card.textContent).toMatch(/15 dec 2026/);
  });
});
