// Pricing never waits for the sidebar: page 1 is requested as soon as the pricing scope
// (facets?counts=0) is known, while the facet counts are still loading.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Results from './Results';

vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => vi.fn() }));
vi.mock('react-redux', () => ({ useSelector: (fn) => fn({ auth: { isAuthenticated: false } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../api', () => ({
  fetchFavouriteCodes: vi.fn(() => Promise.resolve(new Set())),
  addFavourite: vi.fn(), removeFavourite: vi.fn(),
}));
const EMPTY_FACETS = {
  holiday: [], stars: [], facilities: [], activities: [],
  accommodation: [], kids: [], beachDistance: [], centreDistance: [],
};
vi.mock('../../api/filters', () => ({
  // The scope call answers at once; the counts call takes 3 s, like a cold facets query.
  fetchFacets: vi.fn((_scope, _filters, opts = {}) => {
    const body = { scope: { countries: [], destinations: ['AYT'], hotelCount: 0 }, matchedDestinations: ['AYT'], included: { hotelCodes: false, attributes: false } };
    if (opts.counts === false) return Promise.resolve(body);
    return new Promise((r) => setTimeout(() => r({ ...body, facets: { ...EMPTY_FACETS, stars: [{ code: 5, count: 3 }] } }), 3000));
  }),
  fetchCountries: vi.fn(() => Promise.resolve([{ code: 'TR', name: 'Turkey' }])),
  fetchDestinations: vi.fn(() => Promise.resolve([])),
  fetchZones: vi.fn(() => Promise.resolve([])),
  fetchArrivalAirports: vi.fn(() => Promise.resolve([
    { code: 'AYT', name: 'Antalya Airport', countryCode: 'TR', destinations: ['AYT'], cityNames: ['Antalya'], zoneCodes: [] },
  ])),
  fetchDepartureAirports: vi.fn(() => Promise.resolve({ airports: [], filtered: null, cacheHasData: false })),
  fetchPackageFares: vi.fn(() => Promise.resolve({})),
  fetchThemes: vi.fn(() => Promise.resolve([])),
  searchDestinationsAndHotels: vi.fn(() => Promise.resolve({ destinations: [], hotels: [] })),
  fetchMatchingHotels: vi.fn(() => Promise.resolve({ count: 0, hotelCodes: [], attributes: {} })),
}));


const cheapestCalls = [];
beforeEach(() => {
  cheapestCalls.length = 0;
  globalThis.fetch = vi.fn((url) => {
    if (String(url).includes('/contracts/cheapest')) cheapestCalls.push(performance.now());
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(String(url).includes('/hotels/bulk')
        ? { data: [] }
        : { nights: 7, count: 0, results: [], cheapest: null, hasMore: false, boardFacets: {} }),
    });
  });
});

describe('pricing does not wait for the facet counts', () => {
  it('asks the cache for page 1 while the counts are still loading, with the scope from counts=0', async () => {
    const { fetchFacets } = await import('../../api/filters');
    fetchFacets.mockClear();
    const t0 = performance.now();
    render(<MemoryRouter initialEntries={['/results?countries=TR&destinationLabel=Turkey&checkIn=2027-03-09&checkOut=2027-03-16&adults=2&children=0&rooms=1']}><Results /></MemoryRouter>);
    await waitFor(() => expect(cheapestCalls.length).toBeGreaterThan(0), { timeout: 2500 });
    expect(cheapestCalls[0] - t0).toBeLessThan(2500);          // well before the 3 s counts
    const modes = fetchFacets.mock.calls.map((c) => c[2]?.counts);
    expect(modes).toContain(false);                             // the scope call
    expect(modes).toContain(undefined);                         // the counts call (default: counts on)
    const scopeCall = fetchFacets.mock.calls.find((c) => c[2]?.counts === false);
    expect(scopeCall[0].countries).toEqual(['TR']);
  });
});
