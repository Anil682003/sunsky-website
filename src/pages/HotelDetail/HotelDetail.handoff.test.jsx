import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Results from '../Results/Results';
import HotelDetail from './HotelDetail';

/**
 * "Please verify" (backlog), Unified Results T21: a results card opens the hotel page with the
 * exact SearchContext, the winner, the dates, the rooms and the airports.
 *
 * End to end on purpose. Each half has its own tests (Results builds the link, the hotel page
 * reads it), but this check is about the two agreeing, and neither half can see that alone: a
 * parameter the card writes and the page never reads, or the page reads under another name,
 * passes both. So the card is rendered, its real link is followed, and the hotel page is judged
 * by what it then ASKS: the matrix it requests, the stay it live-checks, the flight it confirms.
 */

vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => vi.fn() }));
vi.mock('react-redux', () => ({ useSelector: (fn) => fn({ auth: { isAuthenticated: false } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../api', () => ({
  useFavourites: () => ({ data: [], loading: false }),
  fetchFavouriteCodes: vi.fn(() => Promise.resolve(new Set())),
  addFavourite: vi.fn(), removeFavourite: vi.fn(),
}));

const post = vi.fn();
const get = vi.fn();
vi.mock('../../services/axiosInstance', () => ({
  default: { post: (...a) => post(...a), get: (...a) => get(...a) },
  SUPPLIER_TIMEOUT: 25000,
}));

const iso = (plusDays) => {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  return d.toISOString().slice(0, 10);
};
// The winning package: an overnight flight from DUS (one of the two airports ticked), so its
// departure date is not its check-in and its airport is not the first one in the list.
const DEP = iso(29);
const CHECK_IN = iso(30);
const RET = iso(37);
const OUT = { from: 'DUS', to: 'AYT', airline: 'XQ', flightNumber: 'XQ141', departure: `${DEP}T23:35:00`, arrival: `${CHECK_IN}T04:10:00`, duration: 215 };
const BACK = { from: 'AYT', to: 'DUS', airline: 'XQ', flightNumber: 'XQ140', departure: `${RET}T09:15:00`, arrival: `${RET}T12:05:00`, duration: 230 };
const PACKAGE = {
  hotelCode: '592205', destination: 'AYT', sunskyPayableTotal: 2100, sunskyPayableTotalRounded: 2100, pricePerPerson: 700,
  currency: 'EUR', board: 'AI', room: 'DBL', departureAirport: 'DUS', arrivalAirport: 'AYT', travelDays: 9,
  stay: { checkin: CHECK_IN, checkout: RET, nights: 7 },
  components: { flight: 1000, hotel: 1100 },
  flight: {
    stops: 0, travelDays: 9, price: 1000,
    outbound: { departureDate: DEP, departureLocal: `${DEP}T23:35`, legs: [OUT] },
    inbound: { departureDate: RET, departureLocal: `${RET}T09:15`, legs: [BACK] },
  },
};
const packageCalls = [];
vi.mock('../../api/filters', () => ({
  fetchFacets: vi.fn((scope) => Promise.resolve({
    scope: { countries: [], destinations: scope.destinations ?? [], hotelCount: 0 },
    matchedDestinations: ['AYT'],
    included: { hotelCodes: false, attributes: false },
    facets: { holiday: [], stars: [], facilities: [], activities: [], accommodation: [], kids: [], beachDistance: [], centreDistance: [] },
  })),
  fetchCountries: vi.fn(() => Promise.resolve([{ code: 'TR', name: 'Turkey' }])),
  fetchDestinations: vi.fn(() => Promise.resolve([])),
  fetchZones: vi.fn(() => Promise.resolve([])),
  fetchDestinationCountries: vi.fn(() => Promise.resolve([])),
  fetchArrivalAirports: vi.fn(() => Promise.resolve([])),
  fetchDepartureAirports: vi.fn(() => Promise.resolve({ airports: [], filtered: null, cacheHasData: false })),
  fetchThemes: vi.fn(() => Promise.resolve([])),
  searchDestinationsAndHotels: vi.fn(() => Promise.resolve({ destinations: [], hotels: [] })),
  fetchMatchingHotels: vi.fn(() => Promise.resolve({ count: 0, hotelCodes: [], attributes: {} })),
  fetchPackages: vi.fn((body) => {
    packageCalls.push(body);
    return Promise.resolve({ hotels: [PACKAGE], hasMore: false, destinationStatus: { AYT: { status: 'FEASIBLE' } }, boardFacets: {} });
  }),
}));

// The hotel page's matrix: the winner's own date, priced as the card priced it, and one more.
const cell = (date, checkin, total, out, back, from) => ({
  date, state: 'AVAILABLE', offerValidation: 'INDICATIVE', sunskyPayableTotal: total, pricePerPerson: Math.ceil(total / 3), currency: 'EUR',
  travelDays: 9, stay: { checkin, checkout: RET, nights: 7 }, departureAirport: from, arrivalAirport: 'AYT', room: 'DBL', board: 'AI',
  flight: { price: 1000, outbound: { departureDate: date, legs: [out] }, inbound: { departureDate: RET, legs: [back] } },
  cheapest: false,
});
const MATRIX = { success: true, status: 'AVAILABLE', prev: null, next: null, cells: [
  { ...cell(DEP, CHECK_IN, 2100, OUT, BACK, 'DUS'), cheapest: true },
  cell(iso(31), iso(31), 2400, { ...OUT, from: 'FRA', departure: `${iso(31)}T06:00:00`, flightNumber: 'XQ151' }, { ...BACK, to: 'FRA', flightNumber: 'XQ150' }, 'FRA'),
] };
const ROOMS = [{ roomName: 'Double Room', roomCode: 'DBL', boardName: 'ALL INCLUSIVE', boardCode: 'AI', sellingRate: 1100, currency: 'EUR', rateKey: 'r1', cancellationPolicies: [] }];
const FARE = { totalPrice: 1000, currency: 'EUR', outbound: { legs: [OUT] }, inbound: { legs: [BACK] }, flightKeys: ['k'], baggage: { checkedKg: 20, checkedPieces: 0, handKg: 8 } };

// Hotel only: the cache's cheapest stay for the search.
const STAY = { hotelCode: '592205', hotelName: 'Royal Test', boardCode: 'AI', roomType: 'DBL', classification: 'NOR', refundable: true, totalAmount: 2400, perPerson: 600, currency: 'EUR', nightlyBreakdown: [] };
const cacheCalls = [];

beforeEach(() => {
  packageCalls.length = 0;
  cacheCalls.length = 0;
  post.mockReset();
  get.mockReset();
  window.history.replaceState(null, '', '/');
  get.mockImplementation((url) => (String(url).includes('package-matrix') ? Promise.resolve({ data: MATRIX }) : Promise.resolve({ data: {} })));
  post.mockImplementation((url) => {
    const u = String(url);
    if (u.includes('hotel-availability')) return Promise.resolve({ data: { results: { hotelbeds: { rooms: ROOMS } } } });
    if (u.includes('cached-search/confirm')) return Promise.resolve({ data: { success: true, status: 'CONFIRMED', flight: FARE } });
    if (u.includes('flight-availability/search')) return Promise.resolve({ data: { results: { airtuerk: { flights: [FARE] } } } });
    return Promise.resolve({ data: {} });
  });
  globalThis.fetch = vi.fn((url, opts) => {
    const u = String(url);
    if (u.includes('/hotels/bulk')) {
      const codes = JSON.parse(opts?.body || '{}').hotelCodes || ['592205'];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: codes.map((c) => ({ hotelCode: c, name: 'Royal Test', stars: 5, images: [], facilities: [] })) }) });
    }
    if (u.includes('hotel-price-calendar')) {
      cacheCalls.push(new URL(u, 'http://x').searchParams);
      const calendar = Array.from({ length: 7 }, (_, i) => ({ date: iso(27 + i), price: 2400 + i * 30, currency: 'EUR' }));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ calendar }) });
    }
    if (u.includes('/contracts/cheapest')) {
      cacheCalls.push(new URL(u, 'http://x').searchParams);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ nights: 7, count: 1, total: 1, results: [STAY], cheapest: STAY, hasMore: false, boardFacets: {} }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

/** Render Results, wait for the one card, and return the hotel-page link it carries. */
const cardLink = async (query) => {
  render(<MemoryRouter initialEntries={[`/results?${query}`]}><Results /></MemoryRouter>);
  const card = await screen.findByRole('article');
  await waitFor(() => expect(within(card).getAllByRole('link').some((a) => a.getAttribute('href').startsWith('/hotel/'))).toBe(true));
  const href = within(card).getAllByRole('link').find((a) => a.getAttribute('href').startsWith('/hotel/')).getAttribute('href');
  cleanup();
  return href;
};
/** Open the hotel page on that link, as the new tab would (the address bar on it too). */
const openHotel = (href) => {
  window.history.replaceState(null, '', href);
  return render(
    <MemoryRouter initialEntries={[href]}>
      <Routes><Route path="/hotel/:hotelCode" element={<HotelDetail />} /></Routes>
    </MemoryRouter>
  );
};
const matrixAsked = () => get.mock.calls.filter(([u]) => String(u).includes('package-matrix')).map(([, o]) => o.params);
const postsTo = (part) => post.mock.calls.filter(([u]) => String(u).includes(part)).map(([, b]) => b);
const checkLive = async (user) => {
  await waitFor(() => expect(screen.getAllByRole('button', { name: /vanaf €\d+/i }).length).toBeGreaterThan(0));
  await user.click(await screen.findByRole('button', { name: /prijs & beschikbaarheid controleren/i }));
  await waitFor(() => expect(postsTo('hotel-availability').length).toBeGreaterThan(0));
};

describe('Flight + Hotel: the card opens the hotel page on its own package and the search behind it', () => {
  const SEARCH = `destination=AYT&destinationLabel=Antalya&checkIn=${DEP}&checkOut=${RET}&adults=2&children=1&childAges=8&rooms=1`
    + '&transport=package&origins=FRA,DUS&routing=nonstop&flex=2';

  it('the link carries the SearchContext and the winner: party, rooms, airports, routing, ± days, dates, package', async () => {
    const href = await cardLink(SEARCH);
    const q = new URLSearchParams(href.split('?')[1]);
    expect(href.startsWith('/hotel/592205?')).toBe(true);
    // The search: who, how many rooms, from where, how, and how flexible.
    expect([q.get('adults'), q.get('children'), q.get('childAges'), q.get('rooms')]).toEqual(['2', '1', '8', '1']);
    expect([q.get('transport'), q.get('origins'), q.get('routing'), q.get('destination')]).toEqual(['package', 'FRA,DUS', 'nonstop', 'AYT']);
    expect(q.get('flex')).toBe('2');
    // The winner: its stay, its airport, its flights and price.
    expect([q.get('checkIn'), q.get('checkOut'), q.get('nights'), q.get('origin')]).toEqual([CHECK_IN, RET, '7', 'DUS']);
    expect([q.get('pkgDep'), q.get('pkgRet'), q.get('pkgFrom'), q.get('pkgTo'), q.get('pkgFlight'), q.get('pkgDays')])
      .toEqual([DEP, RET, 'DUS', 'AYT', '1000', '9']);
    expect(q.get('total')).toBe('2100');
  });

  it('the hotel page asks its matrix for that search, from the winner\'s departure date', async () => {
    openHotel(await cardLink(SEARCH));
    await waitFor(() => expect(matrixAsked().length).toBeGreaterThan(0));
    expect(matrixAsked()[0]).toMatchObject({
      hotelCode: '592205', destination: 'AYT', date: DEP, travelDays: '9',
      // Both ticked airports compete per date (UI-03); neither is narrowed to the winner's.
      origins: 'DUS,FRA', routing: 'nonstop',
      adults: '2', children: '1', childAges: '8', rooms: '1',
    });
    // The winner's date is the one selected, at the price the card showed (EUR 700 p.p.).
    await waitFor(() => {
      const sel = screen.getAllByRole('button', { name: /vanaf €\d+/i }).find((b) => b.getAttribute('aria-pressed') === 'true');
      expect(sel?.getAttribute('aria-label')).toMatch(/vanaf €700\b/);
    });
  });

  it('the live check asks about exactly the card\'s package: its stay, its party, its flights', async () => {
    const user = userEvent.setup();
    openHotel(await cardLink(SEARCH));
    await checkLive(user);
    expect(postsTo('hotel-availability')[0]).toMatchObject({ hotelCode: '592205', checkin: CHECK_IN, checkout: RET, adults: 2, children: 1, childAges: [8], rooms: 1 });
    await waitFor(() => expect(postsTo('flight-availability/search').length).toBeGreaterThan(0));
    expect(postsTo('flight-availability/search')[0]).toMatchObject({ from: 'DUS', to: 'AYT', depdate: DEP, retdate: RET });
    await waitFor(() => expect(postsTo('cached-search/confirm').length).toBeGreaterThan(0));
    expect(postsTo('cached-search/confirm')[0]).toMatchObject({
      from: 'DUS', to: 'AYT', depdate: DEP, retdate: RET, totalPrice: 1000,
      outbound: { legs: [{ airline: 'XQ', flightNumber: '141', departure: `${DEP}T23:35` }] },
      inbound: { legs: [{ airline: 'XQ', flightNumber: '140', departure: `${RET}T09:15` }] },
    });
  });
});

describe('Hotel only: the card opens the hotel page on the searched stay, for every room', () => {
  const SEARCH = `destination=AYT&destinationLabel=Antalya&checkIn=${CHECK_IN}&checkOut=${RET}&adults=4&children=0&rooms=2&transport=hotel_only&flex=1`;

  it('the link carries the stay, the rooms, the product and the ± days; the page prices that, with no flight', async () => {
    const user = userEvent.setup();
    const href = await cardLink(SEARCH);
    const q = new URLSearchParams(href.split('?')[1]);
    expect([q.get('checkIn'), q.get('checkOut'), q.get('adults'), q.get('children'), q.get('rooms'), q.get('transport'), q.get('flex')])
      .toEqual([CHECK_IN, RET, '4', '0', '2', 'hotel_only', '1']);

    cacheCalls.length = 0;
    openHotel(href);
    await waitFor(() => expect(cacheCalls.length).toBeGreaterThan(0));
    expect([cacheCalls[0].get('adults'), cacheCalls[0].get('rooms')]).toEqual(['4', '2']);
    await checkLive(user);
    expect(postsTo('hotel-availability')[0]).toMatchObject({ checkin: CHECK_IN, checkout: RET, adults: 4, rooms: 2 });
    // Own transport: no flight is asked for at all.
    expect(postsTo('flight-availability')).toHaveLength(0);
    expect(matrixAsked()).toHaveLength(0);
  });
});
