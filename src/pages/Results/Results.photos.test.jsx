import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
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


// Card photos: the first render's cards load their photo at once (top 6 first); the
// no-photo tile only for a hotel without photos, or whose photo failed at every size.
const results = Array.from({ length: 20 }, (_, i) => ({
  hotelCode: String(400 + i), hotelName: `Hotel ${i}`, boardCode: 'AI', roomType: 'DBL',
  classification: 'NOR', refundable: true, totalAmount: 100 + i * 10, perPerson: 50 + i * 5,
  currency: 'EUR', nightlyBreakdown: [],
}));
const photo = (i) => `https://photos.hotelbeds.com/giata/00/0000${i}/0000${i}a_hb_a_001.jpg`;
const info = results.map((r, i) => ({
  hotelCode: r.hotelCode, name: r.hotelName,
  images: i === 19 ? [] : [{ url: photo(i), visualOrder: 1 }],   // the last hotel has no photo
}));

beforeEach(() => {
  globalThis.fetch = vi.fn((url) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(String(url).includes('/hotels/bulk')
      ? { data: info }
      : { nights: 3, count: 20, results, cheapest: results[0], hasMore: false, boardFacets: {} }),
  }));
});

const renderPage = () => render(
  <MemoryRouter initialEntries={['/results?destination=AYT&destinationLabel=Antalya&checkIn=2026-08-15&checkOut=2026-08-18&adults=2&children=0&rooms=1']}>
    <Results />
  </MemoryRouter>
);
const cardImgs = (c) => [...c.querySelectorAll('article img')].filter((img) => /photos\.hotelbeds\.com/.test(img.getAttribute('src') || ''));

describe('result card photos', () => {
  it('the first render loads every card photo at once, the top 6 at high priority', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(cardImgs(container).length).toBe(19));
    const imgs = cardImgs(container);
    expect(imgs.every((img) => img.getAttribute('loading') === 'eager')).toBe(true);
    expect(imgs.slice(0, 6).every((img) => img.getAttribute('fetchpriority') === 'high')).toBe(true);
    expect(imgs.slice(6).every((img) => img.getAttribute('fetchpriority') !== 'high')).toBe(true);
  });

  it('while a photo downloads the card shows the shimmer, not "no images"', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(cardImgs(container).length).toBe(19));
    const first = container.querySelector('article');
    expect(first.textContent).not.toMatch(/Geen afbeeldingen|No images available/);
  });

  it('a hotel without photos, and a photo that fails at every size, show the no-photo tile', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(cardImgs(container).length).toBe(19));
    const cards = [...container.querySelectorAll('article')];
    expect(cards[19].textContent).toMatch(/Geen afbeeldingen|No images available/);
    // fail the first card's photo down its whole size chain
    for (let n = 0; n < 6; n++) {
      const img = cards[0].querySelector('img[src*="photos.hotelbeds.com"]');
      if (!img) break;
      fireEvent.error(img);
    }
    await waitFor(() => expect(cards[0].textContent).toMatch(/Geen afbeeldingen|No images available/));
  });
});
