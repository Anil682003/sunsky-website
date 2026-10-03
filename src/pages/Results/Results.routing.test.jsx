// Build order, step 13: "Non-stop flights only" on the results page. Shown only when it can change
// something (a priced flight has a stop), sent to the package fares, carried in the URL, and it
// can only narrow: the backend applies the destination airport's connection policy first.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const fares = { current: {} };
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
  fetchArrivalAirports: vi.fn(() => Promise.resolve([
    { code: 'AYT', name: 'Antalya Airport', countryCode: 'TR', destinations: ['AYT'], cityNames: ['Antalya'], zoneCodes: [] },
  ])),
  fetchDepartureAirports: vi.fn(() => Promise.resolve({ airports: [], filtered: null, cacheHasData: false })),
  fetchPackageFares: vi.fn(() => Promise.resolve(fares.current)),
  fetchThemes: vi.fn(() => Promise.resolve([])),
  searchDestinationsAndHotels: vi.fn(() => Promise.resolve({ destinations: [], hotels: [] })),
  fetchMatchingHotels: vi.fn(() => Promise.resolve({ count: 0, hotelCodes: [], attributes: {} })),
}));

const results = Array.from({ length: 3 }, (_, i) => ({
  hotelCode: String(300 + i), hotelName: `Hotel ${i}`, destinationCode: 'AYT', boardCode: 'AI', roomType: 'DBL',
  classification: 'NOR', refundable: true, totalAmount: 600 + i * 10, perPerson: 300 + i * 5,
  currency: 'EUR', nightlyBreakdown: [],
}));

beforeEach(async () => {
  globalThis.fetch = vi.fn((url) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(String(url).includes('/hotels/bulk')
      ? { data: [] }
      : { nights: 3, count: 3, results, cheapest: results[0], hasMore: false, boardFacets: {} }),
  }));
  const { fetchPackageFares } = await import('../../api/filters');
  fetchPackageFares.mockClear();
});

const QUERY = '/results?destination=AYT&destinationLabel=Antalya&checkIn=2026-11-03&checkOut=2026-11-10&adults=2&children=0&rooms=1&transport=package';
const renderAt = (extra = '') => render(<MemoryRouter initialEntries={[`${QUERY}${extra}`]}><Results /></MemoryRouter>);
const nonstopBox = () => screen.queryAllByRole('checkbox', { name: 'Alleen non-stop vluchten' })[0];
const lastFareCall = async () => {
  const { fetchPackageFares } = await import('../../api/filters');
  return fetchPackageFares.mock.calls.at(-1)?.[0];
};

describe('Non-stop flights only (step 13)', () => {
  it('is offered once a priced flight has a stop, and asks for non-stop fares when ticked', async () => {
    fares.current = { AYT: { price: 300, currency: 'EUR', priorityClass: 'one_stop', stops: 1 } };
    const user = userEvent.setup();
    renderAt();
    await waitFor(() => expect(nonstopBox()).toBeTruthy());
    expect((await lastFareCall()).routing).toBeUndefined();

    await user.click(nonstopBox());
    await waitFor(async () => expect((await lastFareCall()).routing).toBe('nonstop'));
  });

  it('is not offered when every priced flight is already non-stop (it would filter nothing)', async () => {
    fares.current = { AYT: { price: 300, currency: 'EUR', priorityClass: 'direct', stops: 0 } };
    renderAt();
    await waitFor(async () => expect(await lastFareCall()).toBeTruthy());
    expect(nonstopBox()).toBeFalsy();
  });

  it('arrives ticked from ?routing=nonstop and says plainly when no non-stop flight is priced', async () => {
    fares.current = { AYT: null };
    renderAt('&routing=nonstop');
    await waitFor(() => expect(nonstopBox()?.checked).toBe(true));
    await waitFor(async () => expect((await lastFareCall())?.routing).toBe('nonstop'));
    // the hotel stays in the list, and the card says why it has no flight price
    expect((await screen.findAllByText(/Geen non-stop vlucht geprijsd/)).length).toBeGreaterThan(0);
  });

  it('ignores a routing the URL does not name: no constraint, never a wider one', async () => {
    fares.current = { AYT: { price: 300, currency: 'EUR', priorityClass: 'direct', stops: 0 } };
    renderAt('&routing=two_stops');
    await waitFor(async () => expect(await lastFareCall()).toBeTruthy());
    expect((await lastFareCall()).routing).toBeUndefined();
  });
});
