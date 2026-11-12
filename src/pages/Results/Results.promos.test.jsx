// Offers on the results page (Levent, 12 Nov 2026): Early Booking and Child Discount, as a label on
// a card only when the cache says the discount is inside that card's price, and as a sidebar filter
// with the cache's counts, sent on as `offers`. Both products.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
const answers = { packages: [], offerFacets: {} };
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
    offerFacets: answers.offerFacets,
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
let FACETS;
beforeEach(() => {
  ROWS = [];
  answers.packages = [];
  answers.offerFacets = {};
  FACETS = {};
  globalThis.fetch = vi.fn((url, opts) => {
    const u = String(url);
    if (u.includes('/hotels/bulk')) {
      const codes = JSON.parse(opts?.body || '{}').hotelCodes || [];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: codes.map((c) => ({ hotelCode: c, name: `Hotel ${c}`, images: [] })) }) });
    }
    if (u.endsWith('/contracts/destinations')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 1, destinations: [{ code: 'AYT' }] }) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ nights: 7, count: ROWS.length, total: ROWS.length, results: ROWS, cheapest: ROWS[0] ?? null, hasMore: false, boardFacets: {}, offerFacets: FACETS }) });
  });
});

const HOTEL_ONLY = '/results?destination=AYT&destinationLabel=Antalya&checkIn=2026-12-15&checkOut=2026-12-22&adults=2&children=0&rooms=1&transport=hotel_only';
const PACKAGE = '/results?destination=AYT&destinationLabel=Antalya&checkIn=2026-11-03&checkOut=2026-11-10&adults=2&children=0&rooms=1&transport=package';
const renderAt = (url) => render(<MemoryRouter initialEntries={[url]}><Results /></MemoryRouter>);
const cardOf = async (code) => (await screen.findAllByRole('article'))
  .find((a) => a.querySelector(`a[href*="/hotel/${code}"]`));
const cacheUrls = () => globalThis.fetch.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('/contracts/cheapest'));

describe('labels: only on a card whose price carries the offer', () => {
  it('Hotel only: Vroegboekkorting on the Early Booking card, nothing on the other', async () => {
    ROWS = [row('201', 500, { offers: ['EARLY_BOOKING'] }), row('202', 520)];
    renderAt(HOTEL_ONLY);
    expect((await cardOf('201')).textContent).toMatch(/Vroegboekkorting/);
    expect((await cardOf('202')).textContent).not.toMatch(/Vroegboekkorting|Kinderkorting/);
  });

  it("Flight + Hotel: Kinderkorting from the package's hotel price", async () => {
    answers.packages = [pkg('301', 1100, { offers: ['CHILD_DISCOUNT'] }), pkg('302', 1200)];
    renderAt(PACKAGE);
    expect((await cardOf('301')).textContent).toMatch(/Kinderkorting/);
    expect((await cardOf('302')).textContent).not.toMatch(/Kinderkorting|Vroegboekkorting/);
  });
});

describe('the Aanbiedingen filter', () => {
  it("shown with the cache's counts; ticking it asks the cache for offers=EARLY_BOOKING", async () => {
    ROWS = [row('201', 500, { offers: ['EARLY_BOOKING'] })];
    FACETS = { EARLY_BOOKING: 3 };
    renderAt(HOTEL_ONLY);
    const box = await screen.findByLabelText('Vroegboekkorting (3)');
    expect(screen.queryByLabelText(/Kinderkorting/)).toBeNull();   // none in this search
    fireEvent.click(box);
    await waitFor(() => expect(cacheUrls().some((u) => /[?&]offers=EARLY_BOOKING(&|$)/.test(u))).toBe(true));
  });

  it('no offers in the search: no section', async () => {
    ROWS = [row('202', 520)];
    renderAt(HOTEL_ONLY);
    await cardOf('202');
    expect(screen.queryByText('Aanbiedingen')).toBeNull();
  });

  it('?promos= in the link: Flight + Hotel asks the admin with offers', async () => {
    const { fetchPackages } = await import('../../api/filters');
    answers.packages = [pkg('301', 1100, { offers: ['CHILD_DISCOUNT'] })];
    answers.offerFacets = { CHILD_DISCOUNT: 1 };
    renderAt(`${PACKAGE}&promos=CHILD_DISCOUNT,LAST_MINUTE`);
    await cardOf('301');
    expect(fetchPackages.mock.calls.at(-1)[0].offers).toBe('CHILD_DISCOUNT');
    expect((await screen.findByLabelText('Kinderkorting (1)')).checked).toBe(true);
  });
});
