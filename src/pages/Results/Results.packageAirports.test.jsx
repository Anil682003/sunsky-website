// "Incl. flight" offers only the airports that can make a package (7 Oct 2026): the departure
// and arrival airports with at least one valid package round trip for the scope and dates (admin
// /feasibility). Gazipasa (connections via Istanbul only) and Eindhoven (no flight to Antalya)
// could only ever answer "No results". Unknown (failed check): every airport stays.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Results from './Results';

vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => vi.fn() }));
vi.mock('react-redux', () => ({ useSelector: (fn) => fn({ auth: { isAuthenticated: false } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../api', () => ({
  fetchFavouriteCodes: vi.fn(() => Promise.resolve(new Set())), addFavourite: vi.fn(), removeFavourite: vi.fn(),
}));
const get = vi.fn();
vi.mock('../../services/axiosInstance', () => ({
  default: { get: (...a) => get(...a), post: vi.fn(() => Promise.resolve({ data: {} })) },
  SUPPLIER_TIMEOUT: 25000,
}));
const EMPTY_FACETS = { holiday: [], stars: [], facilities: [], activities: [], accommodation: [], kids: [], beachDistance: [], centreDistance: [] };
const dep = (code, city) => ({ code, city, label: `${city} Airport`, popular: true, countryIso: 'BE' });
vi.mock('../../api/filters', () => ({
  fetchFacets: vi.fn((scope) => Promise.resolve({
    scope: { countries: [], destinations: scope.destinations ?? [], hotelCount: 0 },
    matchedDestinations: scope.destinations?.length ? scope.destinations : ['AYT'],
    included: { hotelCodes: false, attributes: false }, facets: EMPTY_FACETS,
  })),
  fetchCountries: vi.fn(() => Promise.resolve([{ code: 'TR', name: 'Turkey' }])),
  fetchDestinations: vi.fn(() => Promise.resolve([])),
  fetchZones: vi.fn(() => Promise.resolve([])),
  fetchArrivalAirports: vi.fn(() => Promise.resolve([
    { code: 'AYT', name: 'Antalya Airport', countryCode: 'TR', destinations: ['AYT'], cityNames: ['Kalkan, Kas'], zoneCodes: [] },
    { code: 'GZP', name: 'Gazipasa Airport', countryCode: 'TR', destinations: ['AYT'], cityNames: ['Gazipasa'], zoneCodes: [] },
  ])),
  fetchDepartureAirports: vi.fn(() => Promise.resolve({ airports: [dep('BRU', 'Brussel'), dep('DUS', 'Dusseldorf'), dep('EIN', 'Eindhoven')], filtered: null, cacheHasData: false })),
  fetchPackages: vi.fn(() => Promise.resolve({ hotels: [], hasMore: false, destinationStatus: {}, boardFacets: {} })),
  fetchThemes: vi.fn(() => Promise.resolve([])),
  searchDestinationsAndHotels: vi.fn(() => Promise.resolve({ destinations: [], hotels: [] })),
  fetchMatchingHotels: vi.fn(() => Promise.resolve({ count: 0, hotelCodes: [], attributes: {} })),
}));

let FEASIBILITY;
beforeEach(() => {
  get.mockReset();
  FEASIBILITY = { success: true, origins: ['BRU', 'DUS'], arrivals: { AYT: { status: 'FEASIBLE', trips: 129 }, GZP: { status: 'NOT_FEASIBLE', trips: 0 } } };
  get.mockImplementation((url) => (String(url).includes('/feasibility')
    ? (FEASIBILITY ? Promise.resolve({ data: FEASIBILITY }) : Promise.reject(new Error('down')))
    : Promise.resolve({ data: {} })));
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [], results: [], hasMore: false }) }));
});
const URL_PKG = '/results?destination=AYT&destinationLabel=Antalya&checkIn=2027-07-04&checkOut=2027-07-10&adults=2&children=2&childAges=10%2C6&rooms=1&transport=package';
const renderAt = (u) => render(<MemoryRouter initialEntries={[u]}><Results /></MemoryRouter>);
const codesShown = () => [...document.querySelectorAll('label')].map((l) => l.textContent).join(' ');

describe('Flight + Hotel offers only the airports that can make a package', () => {
  it('asks the admin for these destinations, dates and party', async () => {
    renderAt(URL_PKG);
    await waitFor(() => expect(get.mock.calls.some(([u]) => String(u).includes('/feasibility'))).toBe(true));
    const [, { params }] = get.mock.calls.find(([u]) => String(u).includes('/feasibility'));
    expect(params).toMatchObject({ destinations: 'AYT', from: '2027-07-04', to: '2027-07-04', travelDays: '7', adults: '2', children: '2', childAges: '10,6' });
  });

  it('departure: Eindhoven (no package to Antalya) is not offered; arrival: Gazipasa (connections only) is not', async () => {
    renderAt(URL_PKG);
    await waitFor(() => expect(codesShown()).toMatch(/BRU/));
    await waitFor(() => expect(codesShown()).not.toMatch(/EIN/));
    expect(codesShown()).toMatch(/DUS/);
    expect(codesShown()).toMatch(/AYT/);
    expect(codesShown()).not.toMatch(/GZP/);
  });

  it('a chosen airport stays visible, so it can be unticked', async () => {
    renderAt(`${URL_PKG}&origins=EIN&arrival=GZP`);
    await waitFor(() => expect(get.mock.calls.some(([u]) => String(u).includes('/feasibility'))).toBe(true));
    await waitFor(() => expect(codesShown()).toMatch(/EIN/));
    expect(codesShown()).toMatch(/GZP/);
  });

  it('when the check fails, every airport stays (unknown is never "no flights")', async () => {
    FEASIBILITY = null;
    renderAt(URL_PKG);
    await waitFor(() => expect(get.mock.calls.some(([u]) => String(u).includes('/feasibility'))).toBe(true));
    await waitFor(() => expect(codesShown()).toMatch(/EIN/));
    expect(codesShown()).toMatch(/GZP/);
  });

  it('Hotel only asks nothing', async () => {
    renderAt(URL_PKG.replace('transport=package', 'transport=hotel_only'));
    await new Promise((r) => setTimeout(r, 300));
    expect(get.mock.calls.some(([u]) => String(u).includes('/feasibility'))).toBe(false);
  });
});
