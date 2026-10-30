// UI-09 (Ch 1 §10): the mandatory local costs on a results card, under the price and before the
// button, in both products. Cache data only: a Flight + Hotel package carries `localCosts`
// (admin /packages), a Hotel only row carries `taxExcluded` (SunSkyCache, internal contracts).
// The amount keeps its cents and is never added to the price; nothing known shows nothing.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
vi.mock('../../api/unpricedHotels', () => ({ fetchUnpricedHotels: vi.fn(() => Promise.resolve([])) }));
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

const row = (code, totalAmount, extra = {}) => ({
  hotelCode: code, totalAmount, totalAmountUnrounded: totalAmount, perPerson: totalAmount / 2,
  boardCode: 'RO', roomType: 'DBL', classification: 'NOR', refundable: true, currency: 'EUR', nightlyBreakdown: [], ...extra,
});
const pkg = (code, total, extra = {}) => ({
  hotelCode: code, destination: 'AYT', sunskyPayableTotal: total, sunskyPayableTotalRounded: Math.ceil(total),
  pricePerPerson: Math.ceil(Math.ceil(total) / 2), currency: 'EUR', board: 'AI', room: 'DBL',
  stay: { checkin: '2026-11-04', checkout: '2026-11-10', nights: 6 }, departureAirport: 'BRU',
  components: { flight: 400, hotel: total - 400 },
  flight: { stops: 0, travelDays: 8, outbound: { departureLocal: '2026-11-03T19:00' }, inbound: { departureLocal: '2026-11-10T10:30' } },
  ...extra,
});
let ROWS;
beforeEach(() => {
  ROWS = [];
  answers.packages = [];
  globalThis.fetch = vi.fn((url, opts) => {
    const u = String(url);
    if (u.includes('/hotels/bulk')) {
      const codes = JSON.parse(opts?.body || '{}').hotelCodes || [];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: codes.map((c) => ({ hotelCode: c, name: `Hotel ${c}`, images: [] })) }) });
    }
    if (u.endsWith('/contracts/destinations')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 1, destinations: [{ code: 'AYT' }] }) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ nights: 7, count: ROWS.length, total: ROWS.length, results: ROWS, cheapest: ROWS[0] ?? null, hasMore: false, boardFacets: {} }) });
  });
});

const HOTEL_ONLY = '/results?destination=AYT&destinationLabel=Antalya&checkIn=2026-12-15&checkOut=2026-12-22&adults=2&children=0&rooms=1&transport=hotel_only';
const PACKAGE = '/results?destination=AYT&destinationLabel=Antalya&checkIn=2026-11-03&checkOut=2026-11-10&adults=2&children=0&rooms=1&transport=package';
const renderAt = (url) => render(<MemoryRouter initialEntries={[url]}><Results /></MemoryRouter>);
const cardOf = async (code) => (await screen.findAllByRole('article'))
  .find((a) => a.querySelector(`a[href*="/hotel/${code}"]`));
const liveCalls = () => axiosPost.mock.calls.filter(([u]) => /hotel-availability|flight-availability\/search/.test(String(u)));

describe('Hotel only: the cache row\'s taxExcluded under the price', () => {
  it('a known €12.40 shows as € 12,40, the SUNSKY total and the per-person price unchanged', async () => {
    ROWS = [row('201', 501, { taxExcluded: 12.4 })];
    renderAt(HOTEL_ONLY);
    const card = await cardOf('201');
    const block = card.querySelector('[data-local-costs]');
    expect(block).not.toBeNull();
    expect(block.textContent).toBe('Te betalen aan SUNSKY € 501Verplicht ter plaatse te betalen: € 12,40');
    // 501 for two is 251 p.p.; with the tax added it would have been 257 (or a total of 514).
    expect(card.textContent).toMatch(/251/);
    expect(card.textContent).not.toMatch(/257|513|514/);
    // Between the price and the button.
    const cta = [...card.querySelectorAll('a')].find((a) => /\/hotel\//.test(a.getAttribute('href')) && a.target === '_blank');
    expect(block.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Cache data only: no supplier call for it.
    expect(liveCalls()).toHaveLength(0);
  });

  it('absent (a Hotelbeds-cache row) or 0: nothing at all, never € 0', async () => {
    ROWS = [row('202', 400), row('203', 450, { taxExcluded: 0 })];
    renderAt(HOTEL_ONLY);
    const a = await cardOf('202');
    const b = await cardOf('203');
    for (const card of [a, b]) {
      expect(card.querySelector('[data-local-costs]')).toBeNull();
      expect(card.textContent).not.toMatch(/ter plaatse|te betalen aan sunsky|€ 0,00/i);
    }
  });
});

describe('Flight + Hotel: the package\'s localCosts under the price', () => {
  it('a known €12.40 shows as € 12,40; the package total stays € 1.101 and 551 p.p.', async () => {
    answers.packages = [pkg('301', 1100.4, { localCosts: { known: 12.4, currency: 'EUR' } })];
    renderAt(PACKAGE);
    const card = await cardOf('301');
    const block = card.querySelector('[data-local-costs]');
    expect(block.textContent).toBe('Te betalen aan SUNSKY € 1.101Verplicht ter plaatse te betalen: € 12,40');
    expect(card.textContent).toMatch(/551/);
    expect(card.textContent).not.toMatch(/1\.113|1\.114|557/);
    expect(liveCalls()).toHaveLength(0);
  });

  it('a package without localCosts shows nothing', async () => {
    answers.packages = [pkg('302', 900)];
    renderAt(PACKAGE);
    const card = await cardOf('302');
    expect(card.querySelector('[data-local-costs]')).toBeNull();
    expect(card.textContent).not.toMatch(/ter plaatse|te betalen aan sunsky/i);
  });

  it('a hotel with only short trips ("View available dates") quotes no local cost either', async () => {
    answers.packages = [pkg('303', 400, { fromPriceEligible: false, commercialMinDays: 5, localCosts: { known: 3.2, currency: 'EUR' } })];
    renderAt(PACKAGE);
    const card = await cardOf('303');
    expect(card.textContent).toMatch(/bekijk beschikbare data/i);
    expect(card.querySelector('[data-local-costs]')).toBeNull();
  });
});
