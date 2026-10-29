// UI-06 on the homepage (Ch1 §9A, Ch3 §4A): Brussels and Antwerp are ticked, and the
// traveller picks a destination only Brussels flies to. The pick is held and they are asked,
// in the page, before Antwerp goes. Without an answer nothing changes.
//
// The destination picker is stubbed down to one button that hands back a fixed pick: what is
// under test is what the hero does with a pick, and DestinationModal has its own suites.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Hero from './Hero';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));

const TR = { id: 1, code: 'TR', isoCode: 'TR', name: 'Turkey' };
vi.mock('../../../api', () => ({
  useHomepageConfig: () => ({ data: null }),
  useCountries: () => ({ data: [TR], loading: false, error: null }),
  searchAirports: vi.fn(() => Promise.resolve([])),
}));

const airport = (code, city) => ({ code, city, label: city, country: '🇧🇪', popular: true });
vi.mock('../../../hooks/useDepartureAirports', () => ({
  useDepartureAirports: () => ({ airports: [airport('BRU', 'Brussels'), airport('ANR', 'Antwerp'), airport('CRL', 'Charleroi')] }),
}));

// The airports ticked last time, which is how a traveller arrives with two of them chosen.
let REMEMBERED;
vi.mock('../../../utils/searchStore', () => ({
  loadSearch: () => REMEMBERED,
  saveSearch: vi.fn(),
}));
vi.mock('../../../utils/paxStore', () => ({ loadPax: () => null, savePax: vi.fn() }));

let PICK;
vi.mock('../../../components/DestinationModal/DestinationModal', () => ({
  default: ({ open, onApply }) => (open
    ? <button type="button" onClick={() => onApply(PICK)}>pick-destination</button>
    : null),
}));

// The admin's /feasibility: which departure airports have a package to these destinations.
// `SERVING` answers per destination code; null makes the check fail.
let SERVING;
const get = vi.fn();
vi.mock('../../../services/axiosInstance', () => ({
  default: { get: (...a) => get(...a), post: vi.fn(() => Promise.resolve({ data: {} })) },
  SUPPLIER_TIMEOUT: 25000,
}));

const ANTALYA = { key: 'city-11', type: 'city', id: 11, code: 'AYT', name: 'Antalya', countryId: 1, countryIso: 'TR' };
const SIDE = { key: 'city-12', type: 'city', id: 12, code: 'SID', name: 'Side', countryId: 1, countryIso: 'TR' };

beforeEach(() => {
  navigate.mockReset();
  get.mockReset();
  REMEMBERED = { mode: 'package', countries: [], places: [], origins: ['BRU', 'ANR'], transport: 'package', date: '', flexDays: 0, duration: '' };
  PICK = { countries: [TR], places: [ANTALYA] };
  SERVING = { AYT: ['BRU'], SID: ['BRU', 'ANR'] };
  get.mockImplementation((url, { params } = {}) => {
    if (url === '/flight-availability/feasibility' && params?.destinations) {
      if (!SERVING) return Promise.reject(new Error('down'));
      const origins = [...new Set(params.destinations.split(',').flatMap((d) => SERVING[d] || []))];
      return Promise.resolve({ data: { success: true, origins, arrivals: {} } });
    }
    return Promise.resolve({ data: {} });
  });
});

const renderHero = () => render(<MemoryRouter><Hero /></MemoryRouter>);
const destinationField = () => screen.getByText('Bestemming').closest('div[class]').parentElement;
const flyingFromField = () => screen.getByText('Vertrek vanaf').closest('div[class]').parentElement;
const pickDestination = () => {
  fireEvent.click(screen.getByText('Waarheen?'));
  fireEvent.click(screen.getByRole('button', { name: 'pick-destination' }));
};
const searchButton = () => screen.getByRole('button', { name: /^Zoeken$/ });
const lastSearch = () => new URLSearchParams(navigate.mock.calls.at(-1)[0].split('?')[1]);

describe('Hero: ask before dropping airports that clash with a new destination', () => {
  it('names the airport that does not fit and changes nothing until asked', async () => {
    renderHero();
    pickDestination();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Antwerp (ANR) vliegt niet naar Antalya');
    expect(dialog).toHaveTextContent('Vanaf Brussels (BRU) kan het wel.');
    expect(dialog).toHaveFocus();
    // Held, not applied: the field still asks where to, and both airports are still ticked.
    expect(destinationField()).toHaveTextContent('Waarheen?');
    expect(flyingFromField()).toHaveTextContent('2 luchthavens');
    // Asked with the destination being picked, not the one in the field.
    expect(get.mock.calls.some(([u, o]) => u === '/flight-availability/feasibility' && o?.params?.destinations === 'AYT')).toBe(true);
  });

  it('"Remove ANR and continue" unticks only ANR and applies the destination', async () => {
    renderHero();
    pickDestination();
    fireEvent.click(await screen.findByRole('button', { name: 'ANR verwijderen en doorgaan' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(destinationField()).toHaveTextContent('Antalya');
    expect(flyingFromField()).toHaveTextContent('Brussels (BRU)');
    fireEvent.click(searchButton());
    const qs = lastSearch();
    expect(qs.get('destination')).toBe('AYT');
    expect(qs.get('origin')).toBe('BRU');
    expect(qs.get('origins')).toBeNull();
  });

  it('"Keep my airports" leaves destination and airports exactly as they were', async () => {
    renderHero();
    pickDestination();
    fireEvent.click(await screen.findByRole('button', { name: 'Mijn luchthavens behouden' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(destinationField()).toHaveTextContent('Waarheen?');
    expect(flyingFromField()).toHaveTextContent('2 luchthavens');
    fireEvent.click(searchButton());
    const qs = lastSearch();
    expect(qs.get('destination')).toBe('');
    expect(qs.get('origins')).toBe('BRU,ANR');
  });

  it('Escape is "keep"', async () => {
    renderHero();
    pickDestination();
    fireEvent.keyDown(await screen.findByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(destinationField()).toHaveTextContent('Waarheen?');
    expect(flyingFromField()).toHaveTextContent('2 luchthavens');
  });

  it('Search with the question open does not answer it for the traveller', async () => {
    renderHero();
    pickDestination();
    const dialog = await screen.findByRole('alertdialog');
    searchButton().focus();
    fireEvent.click(searchButton());
    expect(navigate).not.toHaveBeenCalled();
    expect(dialog).toHaveFocus();
  });

  it('every ticked airport stranded: it says so and offers no removal', async () => {
    SERVING = { AYT: ['CRL'] };
    renderHero();
    pickDestination();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Brussels (BRU) en Antwerp (ANR) vliegen niet naar Antalya');
    expect(screen.queryByRole('button', { name: /verwijderen/ })).toBeNull();
    expect(destinationField()).toHaveTextContent('Waarheen?');
  });

  it('when both airports fly there the pick simply goes through', async () => {
    PICK = { countries: [TR], places: [SIDE] };
    renderHero();
    pickDestination();
    await waitFor(() => expect(destinationField()).toHaveTextContent('Side'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(flyingFromField()).toHaveTextContent('2 luchthavens');
  });

  it('a failed check asks nothing: unknown is not impossible', async () => {
    SERVING = null;
    renderHero();
    pickDestination();
    await waitFor(() => expect(destinationField()).toHaveTextContent('Antalya'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(flyingFromField()).toHaveTextContent('2 luchthavens');
  });

  it('a whole country cannot be checked, so it is applied without a question (case 20)', async () => {
    PICK = { countries: [TR], places: [] };
    renderHero();
    pickDestination();
    await waitFor(() => expect(destinationField()).toHaveTextContent('Turkije'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(get.mock.calls.some(([u, o]) => u === '/flight-availability/feasibility' && o?.params?.destinations)).toBe(false);
  });

  it('one airport ticked is left to UI-05, which greys what it cannot reach before the pick', async () => {
    REMEMBERED = { ...REMEMBERED, origins: ['ANR'] };
    renderHero();
    pickDestination();
    // Applied at once; the hero does not second-guess the per-origin answer the modal greyed by.
    expect(destinationField()).toHaveTextContent('Antalya');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
