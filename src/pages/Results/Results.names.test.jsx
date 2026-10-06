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
// The content-filter API (admin) is a different transport from the price cache (fetch), so it
// needs its own stub — without one these tests fire real axios requests, which is both slow
// and non-deterministic. Empty facet lists = "this scope has no content facets", which is the
// state that decides whether the optional sidebar sections render at all.
const EMPTY_FACETS = {
  holiday: [], stars: [], facilities: [], activities: [],
  accommodation: [], kids: [], beachDistance: [], centreDistance: [],
};
vi.mock('../../api/filters', () => ({
  fetchFacets: vi.fn(() => Promise.resolve({
    scope: { countries: [], destinations: ['AYT'], hotelCount: 0 },
    matchedDestinations: ['AYT'],
    included: { hotelCodes: false, attributes: false },
    facets: EMPTY_FACETS,
  })),
  fetchCountries: vi.fn(() => Promise.resolve([{ code: 'TR', name: 'Turkey' }])),
  fetchDestinations: vi.fn(() => Promise.resolve([])),
  // The Where filter's ScopePicker resolves zones on mount; a factory that omits an export the
  // tree imports throws at render, not at import, so every test in the file fails at once.
  fetchZones: vi.fn(() => Promise.resolve([])),
  fetchArrivalAirports: vi.fn(() => Promise.resolve([])),
  fetchThemes: vi.fn(() => Promise.resolve([])),
  searchDestinationsAndHotels: vi.fn(() => Promise.resolve({ destinations: [], hotels: [] })),
  fetchMatchingHotels: vi.fn(() => Promise.resolve({ count: 0, hotelCodes: [], attributes: {} })),
}));


// Never a hotel code on a card (7 Oct 2026): the price cache carries codes only, and cards used
// to read "Hotel 99157" until /hotels/bulk answered. Now: a skeleton until the name arrives; if
// the info request fails (after one retry), a neutral "Hotel", still never the code.
const results = Array.from({ length: 3 }, (_, i) => ({
  hotelCode: String(99150 + i), boardCode: 'AI', roomType: 'DBL',       // no hotelName, as the cache sends
  classification: 'NOR', refundable: true, totalAmount: 100 + i * 10, perPerson: 50 + i * 5,
  currency: 'EUR', nightlyBreakdown: [],
}));
const names = ['Mercure Berlin', 'IntercityHotel Berlin', 'Hotel Adlon'];

let bulk;   // how /hotels/bulk answers in a test
let bulkCalls;
beforeEach(() => {
  bulkCalls = 0;
  globalThis.fetch = vi.fn((url) => {
    if (String(url).includes('/hotels/bulk')) { bulkCalls += 1; return bulk(); }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ nights: 3, count: 3, results, cheapest: results[0], hasMore: false, boardFacets: {} }) });
  });
});

const renderPage = () => render(
  <MemoryRouter initialEntries={['/results?destination=AYT&destinationLabel=Antalya&checkIn=2026-08-15&checkOut=2026-08-18&adults=2&children=0&rooms=1']}>
    <Results />
  </MemoryRouter>
);
const cardTitles = (c) => [...c.querySelectorAll('article h3')].map((h) => h.textContent);
const hasCode = (c) => results.some((r) => c.textContent.includes(r.hotelCode));

describe('hotel names on result cards', () => {
  it('a skeleton while the info loads, then the real names: never the code', async () => {
    let release;
    bulk = () => new Promise((resolve) => { release = () => resolve({ ok: true, json: () => Promise.resolve({ data: results.map((r, i) => ({ hotelCode: r.hotelCode, name: names[i], images: [] })) }) }); });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelectorAll('article').length).toBe(3));
    expect(cardTitles(container)).toEqual([]);            // no name yet: skeletons
    expect(hasCode(container)).toBe(false);
    release();
    await waitFor(() => expect(cardTitles(container)).toEqual(names));
    expect(hasCode(container)).toBe(false);
  });

  it('info request fails twice: a neutral name, still never the code', async () => {
    bulk = () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
    const { container } = renderPage();
    await waitFor(() => expect(cardTitles(container)).toEqual(['Hotel', 'Hotel', 'Hotel']), { timeout: 4000 });
    expect(bulkCalls).toBe(2);                             // one retry
    expect(hasCode(container)).toBe(false);
  });

  it('first attempt fails, the retry answers: real names', async () => {
    let n = 0;
    bulk = () => (n++ === 0
      ? Promise.reject(new Error('network'))
      : Promise.resolve({ ok: true, json: () => Promise.resolve({ data: results.map((r, i) => ({ hotelCode: r.hotelCode, name: names[i], images: [] })) }) }));
    const { container } = renderPage();
    await waitFor(() => expect(cardTitles(container)).toEqual(names), { timeout: 4000 });
  });
});
