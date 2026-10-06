// "Incl. flight" results from the admin's package search (7 Oct 2026; packageResults.js): complete
// packages only (Levent, 6 Oct 2026), each card from one package, a search without dates asking
// the precalculated default, a country asked per group of destinations, and destinations whose
// flight data is missing named as such.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
const answers = { byDest: {} };   // destination → { hotels, status }
const pkg = (code, dest, total, extra = {}) => ({
  hotelCode: code, destination: dest, sunskyPayableTotal: total, sunskyPayableTotalRounded: Math.ceil(total), pricePerPerson: Math.ceil(Math.ceil(total) / 2),
  currency: 'EUR', board: 'AI', room: 'DBL', stay: { checkin: '2026-11-04', checkout: '2026-11-10', nights: 6 }, departureAirport: 'BRU',
  components: { flight: 400, hotel: total - 400 },
  flight: { stops: 0, travelDays: 8, outbound: { departureLocal: '2026-11-03T19:00' }, inbound: { departureLocal: '2026-11-10T10:30' } },
  ...extra,
});
vi.mock('../../api/filters', () => ({
  fetchFacets: vi.fn((scope) => Promise.resolve({
    scope: { countries: scope.countries ?? [], destinations: scope.destinations ?? [], hotelCount: 0 },
    matchedDestinations: scope.destinations?.length ? scope.destinations : ['AYT', 'IST', 'ADB', 'DLM', 'BJV'],
    included: { hotelCodes: false, attributes: false },
    facets: EMPTY_FACETS,
  })),
  fetchCountries: vi.fn(() => Promise.resolve([{ code: 'TR', name: 'Turkey' }])),
  fetchDestinations: vi.fn(() => Promise.resolve([])),
  fetchZones: vi.fn(() => Promise.resolve([])),
  fetchArrivalAirports: vi.fn(() => Promise.resolve([])),
  fetchDepartureAirports: vi.fn(() => Promise.resolve({ airports: [], filtered: null, cacheHasData: false })),
  fetchPackages: vi.fn((body) => {
    const hotels = body.destinations.flatMap((d) => answers.byDest[d]?.hotels || [])
      .sort((a, b) => a.sunskyPayableTotal - b.sunskyPayableTotal);
    const page = body.page || 1;
    const size = 2;   // small pages, to exercise "Show more" across groups
    return Promise.resolve({
      hotels: hotels.slice((page - 1) * size, page * size), hasMore: hotels.length > page * size,
      destinationStatus: Object.fromEntries(body.destinations.map((d) => [d, { status: answers.byDest[d]?.status || 'NOT_FEASIBLE' }])),
      boardFacets: {},
    });
  }),
  fetchThemes: vi.fn(() => Promise.resolve([])),
  searchDestinationsAndHotels: vi.fn(() => Promise.resolve({ destinations: [], hotels: [] })),
  fetchMatchingHotels: vi.fn(() => Promise.resolve({ count: 0, hotelCodes: [], attributes: {} })),
}));

const sentToCache = [];
beforeEach(async () => {
  sentToCache.length = 0;
  answers.byDest = {};
  globalThis.fetch = vi.fn((url) => {
    if (String(url).includes('/contracts/cheapest')) sentToCache.push(String(url));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [], results: [], hasMore: false }) });
  });
  const { fetchPackages } = await import('../../api/filters');
  fetchPackages.mockClear();
});
const calls = async () => (await import('../../api/filters')).fetchPackages.mock.calls.map((c) => c[0]);
const renderAt = (q) => render(<MemoryRouter initialEntries={[`/results${q}`]}><Results /></MemoryRouter>);
const DATED = '?destination=AYT&destinationLabel=Antalya&checkIn=2026-11-03&checkOut=2026-11-10&adults=2&children=0&rooms=1&transport=package';

describe('"Incl. flight" lists complete packages (Levent, 6 Oct 2026)', () => {
  it('a card is the package: its p.p. price, its own stay, departure airport and flight times', async () => {
    answers.byDest.AYT = { status: 'FEASIBLE', hotels: [pkg('34585', 'AYT', 1100.4)] };
    renderAt(DATED);
    const card = await screen.findByRole('article');
    expect(card.textContent).toMatch(/551/);                       // ceil(1101 / 2)
    expect(card.textContent).toMatch(/19:00/);
    expect(card.textContent).toMatch(/10:30/);
    expect(card.textContent).toMatch(/6 nacht/);                  // the package's own stay (overnight arrival)
    expect(card.textContent).not.toMatch(/34585/);                // never the hotel code
    expect(sentToCache).toHaveLength(0);                          // no hotel-only cache search
    const [body] = await calls();
    expect(body).toMatchObject({ destinations: ['AYT'], from: '2026-11-03', to: '2026-11-03', travelDays: '8', adults: '2' });
  });

  it('the card opens the hotel page on the stay and airport of its package', async () => {
    answers.byDest.AYT = { status: 'FEASIBLE', hotels: [pkg('34585', 'AYT', 1100.4)] };
    renderAt(DATED);
    const card = await screen.findByRole('article');
    const link = within(card).getAllByRole('link').find((a) => a.getAttribute('href').startsWith('/hotel/'));
    const q = new URLSearchParams(link.getAttribute('href').split('?')[1]);
    expect([q.get('checkIn'), q.get('checkOut'), q.get('origin')]).toEqual(['2026-11-04', '2026-11-10', 'BRU']);
  });

  it('a link without dates asks the precalculated default (instant)', async () => {
    answers.byDest.AYT = { status: 'FEASIBLE', hotels: [pkg('1', 'AYT', 900)] };
    renderAt('?destinations=AYT&destinationLabel=Antalya&transport=package');
    await screen.findByRole('article');
    const [body] = await calls();
    expect(body).toMatchObject({ destinations: ['AYT'], nights: '7' });
    expect(body.from).toBeUndefined();
    expect(body.travelDays).toBeUndefined();
  });

  it('a country: one request per group of 4 destinations, merged cheapest first', async () => {
    answers.byDest = {
      AYT: { status: 'FEASIBLE', hotels: [pkg('a', 'AYT', 900)] },
      BJV: { status: 'FEASIBLE', hotels: [pkg('b', 'BJV', 500)] },
      IST: { status: 'FEASIBLE', hotels: [pkg('c', 'IST', 700)] },
    };
    renderAt('?countries=TR&destinationLabel=Turkije&checkIn=2026-11-03&checkOut=2026-11-10&adults=2&children=0&rooms=1&transport=package');
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));
    const bodies = await calls();
    expect(bodies.map((b) => b.destinations.length).sort()).toEqual([1, 4]);
    expect(screen.getAllByRole('article')[0].textContent).toMatch(/250/);   // b: ceil(500 / 2), the cheapest, first
    expect(screen.getAllByRole('article')[2].textContent).toMatch(/450/);   // a, the dearest, last
  });

  it('a destination without flight data is named, not silently dropped and never "no flights"', async () => {
    answers.byDest = { AYT: { status: 'FEASIBLE', hotels: [pkg('a', 'AYT', 900)] }, ADB: { status: 'UNKNOWN' } };
    renderAt('?destinations=AYT,ADB&destinationLabel=Turkije&checkIn=2026-11-03&checkOut=2026-11-10&adults=2&children=0&rooms=1&transport=package');
    expect(await screen.findByText(/kunnen nog niet berekend worden/)).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('only missing data and no package: says the prices cannot be calculated yet, not "no results"', async () => {
    answers.byDest = { ADB: { status: 'UNKNOWN' } };
    renderAt('?destinations=ADB&destinationLabel=Izmir&checkIn=2026-11-03&checkOut=2026-11-10&adults=2&children=0&rooms=1&transport=package');
    expect(await screen.findByRole('heading', { name: /kunnen nog niet berekend worden/ })).toBeInTheDocument();
  });

  it('Show more: the next page of every group that could hold a cheaper package, merged in order', async () => {
    // 5 packages in one group, pages of 2 (the mock): page 1 shows 2, and the page shows all
    // loaded up to PAGE_SIZE. More arrive through "Show more".
    answers.byDest.AYT = { status: 'FEASIBLE', hotels: [100, 200, 300, 400, 500].map((t, i) => pkg(`h${i}`, 'AYT', t)) };
    renderAt(DATED);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Toon meer|Show more/ }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(4));
    const bodies = await calls();
    expect(bodies.map((b) => b.page)).toEqual([1, 2]);
  });
});
