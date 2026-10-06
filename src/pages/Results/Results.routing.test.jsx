// Build order, step 13: "Non-stop flights only" on the results page. Shown only when it can change
// something (a listed package's flight has a stop), sent to the package search, carried in the
// URL, and it can only narrow: the backend applies the routing rule first. "Incl. flight" lists
// complete packages only (Levent, 6 Oct 2026), so a hotel without a non-stop package is not shown.
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
const pkgs = { current: [] };
const pkg = (code, stops) => ({
  hotelCode: code, destination: 'AYT', sunskyPayableTotal: 900, sunskyPayableTotalRounded: 900, pricePerPerson: 450, currency: 'EUR',
  board: 'AI', room: 'DBL', stay: { checkin: '2026-11-03', checkout: '2026-11-10', nights: 7 }, departureAirport: 'BRU',
  components: { flight: 400, hotel: 500 },
  flight: { stops, travelDays: 8, outbound: { departureLocal: '2026-11-03T08:00' }, inbound: { departureLocal: '2026-11-10T14:00' } },
});
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
  fetchPackages: vi.fn(() => Promise.resolve({ hotels: pkgs.current, hasMore: false, destinationStatus: { AYT: { status: pkgs.current.length ? 'FEASIBLE' : 'NOT_FEASIBLE' } }, boardFacets: {} })),
  fetchThemes: vi.fn(() => Promise.resolve([])),
  searchDestinationsAndHotels: vi.fn(() => Promise.resolve({ destinations: [], hotels: [] })),
  fetchMatchingHotels: vi.fn(() => Promise.resolve({ count: 0, hotelCodes: [], attributes: {} })),
}));

beforeEach(async () => {
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) }));
  const { fetchPackages } = await import('../../api/filters');
  fetchPackages.mockClear();
});

const QUERY = '/results?destination=AYT&destinationLabel=Antalya&checkIn=2026-11-03&checkOut=2026-11-10&adults=2&children=0&rooms=1&transport=package';
const renderAt = (extra = '') => render(<MemoryRouter initialEntries={[`${QUERY}${extra}`]}><Results /></MemoryRouter>);
const nonstopBox = () => screen.queryAllByRole('checkbox', { name: 'Alleen non-stop vluchten' })[0];
const lastPackageCall = async () => {
  const { fetchPackages } = await import('../../api/filters');
  return fetchPackages.mock.calls.at(-1)?.[0];
};

describe('Non-stop flights only (step 13)', () => {
  it('is offered once a listed package has a stop, and asks for non-stop packages when ticked', async () => {
    pkgs.current = [pkg('300', 1), pkg('301', 0)];
    const user = userEvent.setup();
    renderAt();
    await waitFor(() => expect(nonstopBox()).toBeTruthy());
    expect((await lastPackageCall()).routing).toBeUndefined();

    await user.click(nonstopBox());
    await waitFor(async () => expect((await lastPackageCall()).routing).toBe('nonstop'));
  });

  it('is not offered when every listed package is already non-stop (it would filter nothing)', async () => {
    pkgs.current = [pkg('300', 0)];
    renderAt();
    await waitFor(async () => expect(await lastPackageCall()).toBeTruthy());
    await screen.findByRole('article');
    expect(nonstopBox()).toBeFalsy();
  });

  it('arrives ticked from ?routing=nonstop; without a non-stop package nothing is listed', async () => {
    pkgs.current = [];
    renderAt('&routing=nonstop');
    await waitFor(() => expect(nonstopBox()?.checked).toBe(true));
    await waitFor(async () => expect((await lastPackageCall())?.routing).toBe('nonstop'));
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('ignores a routing the URL does not name: no constraint, never a wider one', async () => {
    pkgs.current = [pkg('300', 0)];
    renderAt('&routing=two_stops');
    await waitFor(async () => expect(await lastPackageCall()).toBeTruthy());
    expect((await lastPackageCall()).routing).toBeUndefined();
  });
});
