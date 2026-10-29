import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Results from './Results';

/**
 * "Please verify" (backlog): the two rules about hotels the results page cannot put a price on.
 *
 *   Ch1 §2  an active price filter leaves out the "Check price" hotels, and they come back once
 *           the filter is cleared;
 *   Ch2 §4  "Check price" hotels sort after every priced hotel, in BOTH price directions.
 *
 * On this page those hotels are the World2Meet ones the price cache never priced
 * (`api/unpricedHotels`): Hotel only, asked for once the priced list has ended, and drawn with
 * "Price on request" and a live-price button instead of an amount. Neither rule lives in a pure
 * helper, so these tests drive the page itself:
 *
 *   - the price sorts belong to the cache (`resultSort` leaves them alone), so "last" is only
 *     true because `displayHotels` appends the unpriced list AFTER the cache's list rather than
 *     merging it in. A price sort written client-side over both lists would have to treat a
 *     missing price as unknown, and the easy mistake there is coercing it to 0, which puts every
 *     unpriced hotel FIRST in "low to high". The descending case is asserted for the same
 *     reason UI-17 asserts both directions: a rule that only holds one way is not the rule.
 *   - the price filter is not applied to them by the cache, because the cache never saw them.
 *     They stay out only because `onRequestKey` refuses to ask while a bound is set, so the test
 *     checks the card AND that nothing was asked under the bound.
 *
 * Flight + Hotel has no "Check price" card on Results at all (complete packages only, Ch3 §1), so
 * this file is Hotel only. The package list's own unpriced state is "View available dates"
 * (UI-10), a different state per the contract (2.6); its sorting is in packageResults.test.js.
 */

vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => vi.fn() }));
vi.mock('react-redux', () => ({ useSelector: (fn) => fn({ auth: { isAuthenticated: false } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
// The page's CMS config (the heading) goes through axios. Answered empty here: unanswered, it
// fails as a network error after the test has finished and is reported against the file.
vi.mock('../../services/axiosInstance', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: {} })), post: vi.fn(() => Promise.resolve({ data: {} })) },
}));
vi.mock('../../api', () => ({
  fetchFavouriteCodes: vi.fn(() => Promise.resolve(new Set())),
  addFavourite: vi.fn(), removeFavourite: vi.fn(),
}));
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
  // A factory that omits an export the tree imports throws at render, not at import.
  fetchZones: vi.fn(() => Promise.resolve([])),
  fetchDestinationCountries: vi.fn(() => Promise.resolve([])),
  fetchArrivalAirports: vi.fn(() => Promise.resolve([])),
  fetchThemes: vi.fn(() => Promise.resolve([])),
  searchDestinationsAndHotels: vi.fn(() => Promise.resolve({ destinations: [], hotels: [] })),
  fetchMatchingHotels: vi.fn(() => Promise.resolve({ count: 0, hotelCodes: [], attributes: {} })),
}));
// The World2Meet sweep. Recorded, so a test can tell "asked and dropped" from "never asked".
const unpricedCalls = [];
vi.mock('../../api/unpricedHotels', () => ({
  fetchUnpricedHotels: vi.fn((q) => {
    unpricedCalls.push(q);
    return Promise.resolve([{ hotelCode: '777', w2mHotelCode: 'W777', boardCode: 'RO', roomName: 'Double', refundable: true }]);
  }),
}));

// Three priced hotels, far enough apart that a wrong order cannot pass by accident.
const PRICED = [
  { hotelCode: '101', totalAmount: 100 },
  { hotelCode: '102', totalAmount: 300 },
  { hotelCode: '103', totalAmount: 500 },
];

/** GET /contracts/cheapest: the bounds and the price direction applied, as the cache does. */
const cheapest = (qs) => {
  const min = qs.get('minPrice') ? Number(qs.get('minPrice')) : null;
  const max = qs.get('maxPrice') ? Number(qs.get('maxPrice')) : null;
  const desc = qs.get('sortBy') === 'price_desc';
  const results = PRICED
    .filter((h) => (min == null || h.totalAmount >= min) && (max == null || h.totalAmount <= max))
    .sort((a, b) => (desc ? b.totalAmount - a.totalAmount : a.totalAmount - b.totalAmount))
    .map((h) => ({
      ...h, boardCode: 'RO', roomType: 'DBL', classification: 'NOR', refundable: true,
      perPerson: h.totalAmount / 2, currency: 'EUR', nightlyBreakdown: [],
    }));
  return { nights: 3, count: results.length, total: results.length, results, cheapest: results[0] ?? null, hasMore: false, boardFacets: {} };
};

let cacheCalls;
beforeEach(() => {
  unpricedCalls.length = 0;
  cacheCalls = [];
  globalThis.fetch = vi.fn((url, opts) => {
    const u = String(url);
    if (u.includes('/hotels/bulk')) {
      const codes = JSON.parse(opts?.body || '{}').hotelCodes || [];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: codes.map((c) => ({ hotelCode: c, name: `Hotel name ${c}`, images: [] })) }) });
    }
    if (u.endsWith('/contracts/destinations')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 1, destinations: [{ code: 'AYT' }] }) });
    const qs = new URL(u, 'http://x').searchParams;
    cacheCalls.push(qs);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(cheapest(qs)) });
  });
});

const renderPage = () => render(
  <MemoryRouter initialEntries={['/results?destination=AYT&destinationLabel=Antalya&checkIn=2026-12-15&checkOut=2026-12-18&adults=2&children=0&rooms=1']}>
    <Results />
  </MemoryRouter>
);

/** The cards in the order they are drawn, each as its hotel code, the unpriced one as 'ask'. */
const order = () => screen.queryAllByRole('article').map((card) => {
  if (/Prijs op aanvraag/.test(card.textContent)) return 'ask';
  const href = card.querySelector('a[href*="/hotel/"]')?.getAttribute('href') || '';
  return (/\/hotel\/([^?]+)/.exec(href) || [])[1] || '?';
});
const sortBy = (user, value) => user.selectOptions(screen.getByRole('combobox', { name: 'Resultaten sorteren' }), value);
const slider = (label) => screen.getAllByRole('slider').find((s) => s.getAttribute('aria-label') === label);

describe('"Check price" hotels sort after every priced hotel, in both price directions (Ch2 §4)', () => {
  it('price low to high: the priced hotels cheapest first, then the unpriced one', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(order()).toContain('ask'));
    await sortBy(user, 'price_asc');
    await waitFor(() => expect(cacheCalls.at(-1).get('sortBy')).toBeNull());   // price_asc is the cache's default order
    await waitFor(() => expect(order()).toEqual(['101', '102', '103', 'ask']));
  });

  it('price high to low: the dearest first, and the unpriced one STILL last, not first', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(order()).toContain('ask'));
    await sortBy(user, 'price_desc');
    await waitFor(() => expect(cacheCalls.at(-1).get('sortBy')).toBe('price_desc'));
    await waitFor(() => expect(order()).toEqual(['103', '102', '101', 'ask']));
  });
});

describe('an active price filter leaves out the "Check price" hotels (Ch1 §2)', () => {
  it('a minimum price: only the priced hotels inside it, the unpriced one gone and never asked for', async () => {
    renderPage();
    await waitFor(() => expect(order()).toContain('ask'));
    const asked = unpricedCalls.length;

    fireEvent.change(slider('Minimumprijs'), { target: { value: '200' } });
    await waitFor(() => expect(cacheCalls.at(-1).get('minPrice')).toBe('200'));
    await waitFor(() => expect(order()).toEqual(['102', '103']));
    // Not merely hidden: a hotel with no price cannot be held against a bound, so the sweep
    // that would have found it does not run under one.
    expect(unpricedCalls.length).toBe(asked);
  });

  it('a maximum price: the same, from the other side', async () => {
    renderPage();
    await waitFor(() => expect(order()).toContain('ask'));
    const asked = unpricedCalls.length;

    fireEvent.change(slider('Maximumprijs'), { target: { value: '300' } });
    await waitFor(() => expect(cacheCalls.at(-1).get('maxPrice')).toBe('300'));
    await waitFor(() => expect(order()).toEqual(['101', '102']));
    // Still so once everything has settled: the list is briefly right between the new priced
    // answer and a sweep that should not have run, so the first match alone proves little.
    await new Promise((r) => setTimeout(r, 400));
    expect(order()).toEqual(['101', '102']);
    expect(unpricedCalls.length).toBe(asked);
  });

  it('they come back once the filter is cleared', async () => {
    renderPage();
    await waitFor(() => expect(order()).toContain('ask'));

    fireEvent.change(slider('Minimumprijs'), { target: { value: '200' } });
    await waitFor(() => expect(order()).toEqual(['102', '103']));

    fireEvent.change(slider('Minimumprijs'), { target: { value: '0' } });
    await waitFor(() => expect(cacheCalls.at(-1).get('minPrice')).toBeNull());
    await waitFor(() => expect(order()).toEqual(['101', '102', '103', 'ask']));
  });
});
