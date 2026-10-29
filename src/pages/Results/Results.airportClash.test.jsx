// UI-06 on the results page (Ch1 §9A, Ch3 §4A): Brussel and Antwerpen are ticked under
// "Incl. flight", the search is Turkey, and the traveller picks Side in the Where filter, which
// only Brussel flies to. The pick is held and they are asked under the picker before Antwerpen
// goes. Without an answer the search and the airports stay exactly as they were.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Results from './Results';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));
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
  fetchDestinations: vi.fn(() => Promise.resolve([
    { code: 'AYT', name: 'Antalya', countryCode: 'TR' },
    { code: 'SID', name: 'Side', countryCode: 'TR' },
  ])),
  fetchZones: vi.fn(() => Promise.resolve([])),
  fetchDestinationCountries: vi.fn(() => Promise.resolve([])),
  fetchArrivalAirports: vi.fn(() => Promise.resolve([])),
  fetchDepartureAirports: vi.fn(() => Promise.resolve({
    airports: [dep('BRU', 'Brussel'), dep('ANR', 'Antwerpen'), dep('CRL', 'Charleroi')], filtered: null, cacheHasData: false,
  })),
  fetchPackages: vi.fn(() => Promise.resolve({ hotels: [], hasMore: false, destinationStatus: {}, boardFacets: {} })),
  fetchThemes: vi.fn(() => Promise.resolve([])),
  searchDestinationsAndHotels: vi.fn(() => Promise.resolve({ destinations: [], hotels: [] })),
  fetchMatchingHotels: vi.fn(() => Promise.resolve({ count: 0, hotelCodes: [], attributes: {} })),
}));

// /feasibility per destination code; a code mapped to null makes that check fail.
let SERVING;
beforeEach(() => {
  navigate.mockReset();
  get.mockReset();
  SERVING = { AYT: ['BRU', 'ANR'], SID: ['BRU'] };
  get.mockImplementation((url, { params } = {}) => {
    if (url === '/flight-availability/feasibility' && params?.destinations) {
      const codes = params.destinations.split(',');
      if (codes.some((d) => SERVING[d] === null)) return Promise.reject(new Error('down'));
      const origins = [...new Set(codes.flatMap((d) => SERVING[d] || []))];
      return Promise.resolve({ data: { success: true, origins, arrivals: {} } });
    }
    return Promise.resolve({ data: {} });
  });
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [], results: [], hasMore: false }) }));
});

const URL_TR = '/results?countries=TR&checkIn=2027-07-04&checkOut=2027-07-10&adults=2&children=0&rooms=1&transport=package';
const renderAt = (u) => render(<MemoryRouter initialEntries={[u]}><Results /></MemoryRouter>);
const airportBox = (code) => [...document.querySelectorAll('label')].find((l) => l.textContent.includes(code))?.querySelector('input');
const scopeNavigations = () => navigate.mock.calls.map(([a]) => a?.search).filter((s) => typeof s === 'string').map((s) => new URLSearchParams(s));

/** Open the Where filter's city field and pick Side, once the page knows both airports. */
const pickSide = async (codes = ['BRU', 'ANR']) => {
  for (const c of codes) await waitFor(() => expect(airportBox(c)?.checked).toBe(true));
  fireEvent.mouseDown(screen.getByTestId('scope-city'));
  fireEvent.click(await screen.findByRole('option', { name: /Side/ }));
};

describe('Results: ask before dropping airports that clash with a new Where pick', () => {
  it('names the airport that does not fit and holds the pick', async () => {
    renderAt(`${URL_TR}&origin=BRU&origins=BRU,ANR`);
    await pickSide();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Antwerpen (ANR) vliegt niet naar Side');
    expect(dialog).toHaveTextContent('Vanaf Brussel (BRU) kan het wel.');
    // Asked about Side, the leaf of Turkey + Side, before anything was navigated to.
    expect(get.mock.calls.some(([u, o]) => u === '/flight-availability/feasibility' && o?.params?.destinations === 'SID')).toBe(true);
    expect(scopeNavigations().some((q) => q.get('destinations') === 'SID')).toBe(false);
  });

  it('"Remove ANR and continue" unticks only ANR and searches Side from Brussel', async () => {
    renderAt(`${URL_TR}&origin=BRU&origins=BRU,ANR`);
    await pickSide();
    fireEvent.click(await screen.findByRole('button', { name: 'ANR verwijderen en doorgaan' }));
    const q = scopeNavigations().find((p) => p.get('destinations') === 'SID');
    expect(q.get('countries')).toBe('TR');
    expect(q.get('origin')).toBe('BRU');
    expect(q.get('origins')).toBeNull();
    // The sidebar's own ticks follow: Brussel stays, Antwerpen is off.
    await waitFor(() => expect(airportBox('ANR')?.checked).toBe(false));
    expect(airportBox('BRU').checked).toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('"Keep my airports" changes nothing: no new search, both airports still ticked', async () => {
    renderAt(`${URL_TR}&origin=BRU&origins=BRU,ANR`);
    await pickSide();
    fireEvent.click(await screen.findByRole('button', { name: 'Mijn luchthavens behouden' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(scopeNavigations().some((q) => q.get('destinations') === 'SID')).toBe(false);
    expect(airportBox('BRU').checked).toBe(true);
    expect(airportBox('ANR').checked).toBe(true);
  });

  it('a failed check asks nothing and the pick goes through with both airports', async () => {
    SERVING.SID = null;
    renderAt(`${URL_TR}&origin=BRU&origins=BRU,ANR`);
    await pickSide();
    await waitFor(() => expect(scopeNavigations().some((q) => q.get('destinations') === 'SID')).toBe(true));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const q = scopeNavigations().find((p) => p.get('destinations') === 'SID');
    expect(q.get('origins')).toBe('BRU,ANR');
  });

  it('when every ticked airport serves the pick it simply goes through', async () => {
    SERVING.SID = ['BRU', 'ANR'];
    renderAt(`${URL_TR}&origin=BRU&origins=BRU,ANR`);
    await pickSide();
    await waitFor(() => expect(scopeNavigations().some((q) => q.get('destinations') === 'SID')).toBe(true));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('one ticked airport that does not fit: Side is not taken until the airport changes', async () => {
    renderAt(`${URL_TR}&origin=ANR`);
    await pickSide(['ANR']);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Antwerpen (ANR) vliegt niet naar Side');
    expect(dialog).toHaveTextContent('Kies eerst een andere vertrekluchthaven');
    expect(screen.queryByRole('button', { name: /verwijderen/ })).toBeNull();
    expect(scopeNavigations().some((q) => q.get('destinations') === 'SID')).toBe(false);
  });

  it('No preference has nothing to clash: the pick is applied at once, unasked', async () => {
    renderAt(URL_TR);
    await waitFor(() => expect(screen.getByTestId('scope-city')).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByTestId('scope-city'));
    fireEvent.click(await screen.findByRole('option', { name: /Side/ }));
    expect(scopeNavigations().some((q) => q.get('destinations') === 'SID')).toBe(true);
    expect(get.mock.calls.some(([u, o]) => u === '/flight-availability/feasibility' && o?.params?.destinations === 'SID')).toBe(false);
  });
});
