import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Results from './Results';

// The hero names the search. A results URL is SHAREABLE, so it carries codes only
// ("countries=TR&destinations=AYT") — the page has to resolve those back to names, and has to
// count them the way the Where picker's badge does: a country and a city inside it are one
// place, not two.
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
const CITIES = [
  { code: 'AYT', name: 'Antalya', countryCode: 'TR', countryName: 'Turkey' },
  { code: 'BJV', name: 'Bodrum',  countryCode: 'TR', countryName: 'Turkey' },
];
const ZONES = [
  { zoneCode: 16, name: 'Side',  destinationCode: 'AYT', destinationName: 'Antalya' },
  { zoneCode: 9,  name: 'Belek', destinationCode: 'AYT', destinationName: 'Antalya' },
];
vi.mock('../../api/filters', () => ({
  fetchFacets: vi.fn(() => Promise.resolve({
    scope: { countries: [], destinations: ['AYT'], hotelCount: 0 },
    matchedDestinations: ['AYT'],
    included: { hotelCodes: false, attributes: false },
    facets: EMPTY_FACETS,
  })),
  fetchCountries: vi.fn(() => Promise.resolve([
    { code: 'TR', name: 'Turkey' }, { code: 'ES', name: 'Spain' },
  ])),
  fetchDestinations: vi.fn(() => Promise.resolve(CITIES)),
  fetchZones: vi.fn(() => Promise.resolve(ZONES)),
  fetchThemes: vi.fn(() => Promise.resolve([])),
  searchDestinationsAndHotels: vi.fn(() => Promise.resolve({ destinations: [], hotels: [] })),
  fetchMatchingHotels: vi.fn(() => Promise.resolve({ count: 0, hotelCodes: [], attributes: {} })),
}));

const results = [{
  hotelCode: '200', hotelName: 'Hotel 0', boardCode: 'AI', roomType: 'DBL',
  classification: 'NOR', refundable: true, totalAmount: 100, perPerson: 50,
  currency: 'EUR', nightlyBreakdown: [],
}];

beforeEach(() => {
  globalThis.fetch = vi.fn((url) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(
        String(url).includes('/hotels/bulk')
          ? { data: [] }
          : { nights: 3, count: 1, results, cheapest: results[0], hasMore: false, boardFacets: {} }
      ),
    })
  );
});

const DATES = 'checkIn=2026-08-15&checkOut=2026-08-18&adults=2&children=0&rooms=1';
const renderScope = (qs) =>
  render(
    <MemoryRouter initialEntries={[`/results?${qs}&${DATES}`]}>
      <Results />
    </MemoryRouter>
  );

const heading = () => screen.getByRole('heading', { level: 1 });

describe('hero scope label', () => {
  it('names a country search', async () => {
    renderScope('countries=TR');
    await waitFor(() => expect(heading()).toHaveTextContent(/Stays in\s*Turkey/));
  });

  it('names a city by name, not by its Hotelbeds code', async () => {
    renderScope('countries=TR&destinations=AYT');
    await waitFor(() => expect(heading()).toHaveTextContent(/Stays in\s*Antalya/));
    expect(heading()).not.toHaveTextContent('AYT');
  });

  it('does not bill a country and a city inside it as two places', async () => {
    renderScope('countries=TR&destinations=AYT');
    await waitFor(() => expect(heading()).toHaveTextContent(/Antalya/));
    expect(heading()).not.toHaveTextContent(/places/);
  });

  it('names the area when one area of one city is picked', async () => {
    renderScope('countries=TR&destinations=AYT&zones=AYT:16');
    await waitFor(() => expect(heading()).toHaveTextContent(/Stays in\s*Side/));
  });

  it('counts each picked area, and a sibling city with no area, as its own place', async () => {
    renderScope('countries=TR&destinations=AYT,BJV&zones=AYT:16,AYT:9');
    // Side + Belek + Bodrum — Antalya and Turkey are ancestors of what was picked.
    await waitFor(() => expect(heading()).toHaveTextContent('3 places'));
  });

  it('keeps the explicit label a search link carries', async () => {
    renderScope('destination=AYT&destinationLabel=Antalya');
    await waitFor(() => expect(heading()).toHaveTextContent(/Stays in\s*Antalya/));
  });

  it('calls an empty search what it is', async () => {
    renderScope('');
    await waitFor(() => expect(heading()).toHaveTextContent(/Popular destinations/));
  });
});
