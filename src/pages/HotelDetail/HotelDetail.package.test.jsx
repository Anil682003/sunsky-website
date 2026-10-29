import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import HotelDetail from './HotelDetail';

// The hotel page of a Flight + Hotel package (7 Oct 2026): the strip is the package matrix, the
// live check asks about the package the results card priced (its flight dates, arrival airport
// and exact flights), and the board shown is the room's own.

const post = vi.fn();
const get = vi.fn();
vi.mock('../../services/axiosInstance', () => ({
  default: { post: (...a) => post(...a), get: (...a) => get(...a) },
  SUPPLIER_TIMEOUT: 25000,
}));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../api', () => ({
  useFavourites: () => ({ data: [], loading: false }), addFavourite: vi.fn(), removeFavourite: vi.fn(),
  fetchFavouriteCodes: vi.fn(() => Promise.resolve(new Set())),
}));

const iso = (plusDays) => {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  return d.toISOString().slice(0, 10);
};
// An overnight package: the flight leaves the evening before check-in.
const DEP = iso(29);
const CHECK_IN = iso(30);
const CHECK_OUT = iso(37);

const PKG_OUT = { from: 'FRA', to: 'AYT', airline: 'XQ', flightNumber: 'XQ141', departure: `${DEP}T23:35:00`, arrival: `${CHECK_IN}T04:10:00`, duration: 215 };
const PKG_BACK = { from: 'AYT', to: 'FRA', airline: 'XQ', flightNumber: 'XQ140', departure: `${CHECK_OUT}T09:15:00`, arrival: `${CHECK_OUT}T12:05:00`, duration: 230 };
const TK_OUT = { from: 'FRA', to: 'AYT', airline: 'TK', flightNumber: 'TK1590', departure: `${DEP}T06:00:00`, arrival: `${DEP}T12:00:00`, duration: 300 };
const TK_BACK = { from: 'AYT', to: 'FRA', airline: 'TK', flightNumber: 'TK1591', departure: `${CHECK_OUT}T13:00:00`, arrival: `${CHECK_OUT}T17:00:00`, duration: 300 };
const fare = (totalPrice, out, back, key) => ({
  totalPrice, currency: 'EUR', outbound: { legs: [out] }, inbound: { legs: [back] }, flightKeys: [key],
  baggage: { checkedKg: 20, checkedPieces: 0, handKg: 8 },
});
const PKG_FARE = fare(1000, PKG_OUT, PKG_BACK, 'k-pkg');
const TK_FARE = fare(900, TK_OUT, TK_BACK, 'k-tk');

const ROOMS = [{ roomName: 'Double Room', roomCode: 'DBL', boardName: 'ROOM ONLY', boardCode: 'RO', sellingRate: 500, currency: 'EUR', rateKey: 'r1', cancellationPolicies: [] }];

// The matrix: the package's own date, and one more.
const cell = (date, checkin, total, legsOut, legsBack) => ({
  date, state: 'AVAILABLE', offerValidation: 'INDICATIVE', sunskyPayableTotal: total, pricePerPerson: Math.ceil(total / 2), currency: 'EUR',
  travelDays: 9, stay: { checkin, checkout: CHECK_OUT, nights: 7 }, departureAirport: 'FRA', arrivalAirport: 'AYT', room: 'DBL', board: 'RO',
  flight: { price: total - 500, outbound: { departureDate: date, legs: legsOut }, inbound: { departureDate: CHECK_OUT, legs: legsBack } },
  cheapest: false,
});
let MATRIX;
let SEARCH;           // the live search's flights
let CONFIRM;          // { status, data } of the confirm endpoint
let CAL;              // the hotel calendar's days (null: a priced week)

const PKG_QS = [
  'pkgOut=XQ%7C141%7C' + encodeURIComponent(`${DEP}T23:35`),
  'pkgBack=XQ%7C140%7C' + encodeURIComponent(`${CHECK_OUT}T09:15`),
  `pkgDep=${DEP}`, `pkgRet=${CHECK_OUT}`, 'pkgFrom=FRA', 'pkgTo=AYT', 'pkgFlight=1000', 'pkgDays=9',
].join('&');

beforeEach(() => {
  post.mockReset();
  get.mockReset();
  MATRIX = { success: true, status: 'AVAILABLE', prev: null, next: null, cells: [
    { ...cell(DEP, CHECK_IN, 1400, [PKG_OUT], [PKG_BACK]), cheapest: true },
    cell(iso(31), iso(31), 1600, [{ ...TK_OUT, departure: `${iso(31)}T06:00:00` }], [TK_BACK]),
  ] };
  SEARCH = [TK_FARE, PKG_FARE];
  CONFIRM = { status: 200, data: { success: true, status: 'CONFIRMED', flight: PKG_FARE } };
  CAL = null;
  get.mockImplementation((url) => (String(url).includes('package-matrix')
    ? Promise.resolve({ data: MATRIX })
    : Promise.resolve({ data: {} })));
  post.mockImplementation((url) => {
    const u = String(url);
    if (u.includes('hotel-availability')) return Promise.resolve({ data: { results: { hotelbeds: { rooms: ROOMS } } } });
    if (u.includes('cached-search/confirm')) {
      return CONFIRM.status === 200
        ? Promise.resolve({ data: CONFIRM.data })
        : Promise.reject(Object.assign(new Error(`HTTP ${CONFIRM.status}`), { response: { status: CONFIRM.status, data: CONFIRM.data } }));
    }
    if (u.includes('flight-availability/search')) return Promise.resolve({ data: { results: { airtuerk: { flights: SEARCH } } } });
    return Promise.resolve({ data: {} });
  });
  globalThis.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('hotel-price-calendar')) {
      const calendar = CAL || Array.from({ length: 7 }, (_, i) => ({ date: iso(27 + i), price: 300 + i * 10, currency: 'EUR' }));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ calendar }) });
    }
    if (u.includes('/hotels/bulk')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ hotelCode: '592205', name: 'Royal Test', stars: 5, images: [], facilities: [] }] }) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false }, reducers: {} });
const seen = vi.fn();
let handedOver = null;
function CheckoutStub() {
  const booking = useLocation().state?.booking || null;
  useEffect(() => { seen(booking); }, [booking]);
  return <div data-testid="checkout">CHECKOUT</div>;
}
const renderPage = (extra = `&${PKG_QS}`, transport = 'package') => render(
  <Provider store={configureStore({ reducer: { auth: auth.reducer } })}>
    <MemoryRouter initialEntries={[`/hotel/592205?checkIn=${CHECK_IN}&checkOut=${CHECK_OUT}&adults=2&children=0&rooms=1&nights=7&destination=TRAYT&name=Royal+Test&origin=FRA&transport=${transport}${extra}`]}>
      <Routes>
        <Route path="/hotel/:hotelCode" element={<HotelDetail />} />
        <Route path="/checkout" element={<CheckoutStub />} />
      </Routes>
    </MemoryRouter>
  </Provider>
);

const flightSearches = () => post.mock.calls.filter(([u]) => String(u).includes('flight-availability/search'));
const confirms = () => post.mock.calls.filter(([u]) => String(u).includes('cached-search/confirm'));
const priceDays = async () => waitFor(() => {
  const found = screen.getAllByRole('button', { name: /vanaf €\d+/i });
  expect(found.length).toBeGreaterThan(0);
  return found;
});
const runCheck = async (user) => {
  await priceDays();
  await user.click(await screen.findByRole('button', { name: /prijs & beschikbaarheid controleren/i }));
  await waitFor(() => expect(flightSearches().length).toBeGreaterThan(0));
};

describe('the strip of a Flight + Hotel package is the package matrix', () => {
  it('asks the matrix for this hotel from the package departure date, not the hotel calendar', async () => {
    renderPage();
    const days = await priceDays();
    expect(get).toHaveBeenCalledWith('/flight-availability/package-matrix', expect.objectContaining({
      // `origins: ''` = every active departure airport (UI-03). The URL carries `origin=FRA`,
      // but that is the airport which priced the card, not an airport the traveller asked for;
      // a real choice arrives as `origins`. Sending FRA here would turn one winning flight into
      // a filter on all seven dates.
      params: expect.objectContaining({ hotelCode: '592205', destination: 'TRAYT', date: DEP, travelDays: '9', origins: '', adults: '2' }),
    }));
    expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('hotel-price-calendar'))).toBe(false);
    // Per person, flight + hotel: €1,400 for two is €700 p.p.
    expect(days[0].getAttribute('aria-label')).toMatch(/€700/);
    // No hotel-only note on a package strip.
    expect(screen.queryByText(/dit zijn hotelprijzen/i)).toBeNull();
  });

  it('a matrix that cannot answer leaves the hotel calendar, marked as hotel prices, so a date can still be checked', async () => {
    get.mockImplementation(() => Promise.reject(Object.assign(new Error('HTTP 500'), { response: { status: 500, data: {} } })));
    renderPage();
    await priceDays();
    expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('hotel-price-calendar'))).toBe(true);
    expect(screen.getByText(/dit zijn hotelprijzen/i)).toBeInTheDocument();
  });

  it('a matrix with no package date around this one: no hotel-price strip, the cheapest holiday offered', async () => {
    // Incl. flight never offers days with no flight as holidays (Levent, 25 Oct 2026).
    MATRIX = { success: true, status: 'NO_FLIGHT_DATE', cells: [], prev: null, next: null };
    renderPage();
    expect(await screen.findByText(/geen vakantie met vlucht rond deze data/i)).toBeInTheDocument();
    expect(screen.queryByText(/dit zijn hotelprijzen/i)).toBeNull();
    expect(screen.getByRole('button', { name: /toon goedkoopste vakantie met vlucht/i })).toBeInTheDocument();
  });

  it('a date with flights and no room is not pickable', async () => {
    MATRIX.cells.push({ date: iso(33), state: 'NO_VALID_COMBINATION', flights: 2 });
    const { container } = renderPage();
    await priceDays();
    const empty = container.querySelectorAll('.fc-col.fc-empty');
    expect(empty).toHaveLength(1);
    expect(empty[0].disabled).toBe(true);
  });

  it('Hotel only keeps the hotel calendar and never asks the matrix', async () => {
    renderPage(`&${PKG_QS}`, 'hotel_only');
    await priceDays();
    expect(get.mock.calls.some(([u]) => String(u).includes('package-matrix'))).toBe(false);
    expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('hotel-price-calendar'))).toBe(true);
  });
});

describe('the live check asks about the package the card priced', () => {
  it('searches the package flight dates and arrival airport, and confirms its exact flights', async () => {
    const user = userEvent.setup();
    renderPage();
    await runCheck(user);
    expect(flightSearches()[0][1]).toMatchObject({ from: 'FRA', to: 'AYT', depdate: DEP, retdate: CHECK_OUT, package: true });
    await waitFor(() => expect(confirms()).toHaveLength(1));
    expect(confirms()[0][1]).toMatchObject({
      from: 'FRA', to: 'AYT', depdate: DEP, retdate: CHECK_OUT, adults: 2, children: 0, infants: 0, totalPrice: 1000,
      outbound: { legs: [{ airline: 'XQ', flightNumber: '141', departure: `${DEP}T23:35` }] },
      inbound: { legs: [{ airline: 'XQ', flightNumber: '140', departure: `${CHECK_OUT}T09:15` }] },
    });
  });

  it('holds the package flight, not the cheaper other one: room €500 + flight €1,000', async () => {
    const user = userEvent.setup();
    renderPage();
    await runCheck(user);
    await waitFor(() => expect(screen.getAllByText(/€1,500/).length).toBeGreaterThan(0));
    expect(screen.queryAllByText(/€1,?400/).length).toBeGreaterThan(0);  // the estimate, struck through
    expect(screen.queryByText(/niet meer te koop/i)).toBeNull();
  });

  it('a package flight beyond the capped list is added from the confirm and held', async () => {
    SEARCH = [TK_FARE];
    const user = userEvent.setup();
    renderPage();
    await runCheck(user);
    await waitFor(() => expect(screen.getAllByText(/€1,500/).length).toBeGreaterThan(0));
  });

  it('the search failed but the confirm found the flight: still a package to book', async () => {
    post.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('hotel-availability')) return Promise.resolve({ data: { results: { hotelbeds: { rooms: ROOMS } } } });
      if (u.includes('cached-search/confirm')) return Promise.resolve({ data: CONFIRM.data });
      if (u.includes('flight-availability/search')) return Promise.reject(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }));
      return Promise.resolve({ data: {} });
    });
    const user = userEvent.setup();
    renderPage();
    await runCheck(user);
    await waitFor(() => expect(screen.getAllByText(/€1,500/).length).toBeGreaterThan(0));
  });

  it('gone: the best alternative is held at its live price, and the page says why', async () => {
    SEARCH = [TK_FARE];
    CONFIRM = { status: 200, data: { success: true, status: 'NOT_AVAILABLE', reason: 'OUTBOUND_NOT_FOUND' } };
    const user = userEvent.setup();
    renderPage();
    await runCheck(user);
    expect(await screen.findByText(/niet meer te koop/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/€1,400/).length).toBeGreaterThan(0));     // 500 + 900
  });

  it('a confirm that failed is never "sold out"', async () => {
    SEARCH = [TK_FARE];
    CONFIRM = { status: 502, data: { success: false, status: 'SOURCE_ERROR', message: 'supplier down' } };
    const user = userEvent.setup();
    renderPage();
    await runCheck(user);
    expect(await screen.findByText(/konden de vlucht van deze pakketreis nu niet controleren/i)).toBeInTheDocument();
    expect(screen.queryByText(/niet meer te koop/i)).toBeNull();
  });

  it('a stay that is not the package\'s asks its own dates, and confirms nothing', async () => {
    const user = userEvent.setup();
    renderPage();
    const days = await priceDays();
    await user.click(days[1]);                                          // the other matrix date: its own package
    await user.click(await screen.findByRole('button', { name: /prijs & beschikbaarheid controleren/i }));
    await waitFor(() => expect(flightSearches().length).toBeGreaterThan(0));
    // That date's package is a day flight leaving on its check-in day.
    expect(flightSearches()[0][1]).toMatchObject({ depdate: iso(31), retdate: CHECK_OUT, to: 'AYT' });
    // Its stay is 6 nights, not the 7 on screen before: the room is priced for that stay.
    const roomCheck = post.mock.calls.find(([u]) => String(u).includes('hotel-availability'));
    expect(roomCheck[1]).toMatchObject({ checkin: iso(31), checkout: CHECK_OUT });
    // Picking a date re-centres the strip on it (Levent, 27 Oct 2026): one matrix request around
    // that departure date, with the same trip length.
    const mx = get.mock.calls.filter(([u]) => String(u).includes('package-matrix'));
    expect(mx).toHaveLength(2);
    expect(mx[1][1].params).toMatchObject({ date: iso(31), travelDays: mx[0][1].params.travelDays });
  });

  it('the arrows page the matrix by its own flight dates', async () => {
    MATRIX.next = iso(45);
    const user = userEvent.setup();
    renderPage();
    await priceDays();
    expect(screen.getByRole('button', { name: /eerdere data tonen/i }).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: /latere data tonen/i }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/flight-availability/package-matrix', expect.objectContaining({
      params: expect.objectContaining({ date: iso(45) }),
    })));
  });

  it('a link without a package (a bookmark, a share) asks the stay dates as before', async () => {
    const user = userEvent.setup();
    // The matrix could not answer (an outage, not "no packages"): the hotel calendar stays.
    MATRIX = { success: false };
    renderPage('');
    await priceDays();
    await user.click(screen.getAllByRole('button', { name: /vanaf €\d+/i }).find((b) => b.getAttribute('aria-pressed') === 'true')
      || screen.getAllByRole('button', { name: /vanaf €\d+/i })[0]);
    await user.click(await screen.findByRole('button', { name: /prijs & beschikbaarheid controleren/i }));
    await waitFor(() => expect(flightSearches().length).toBeGreaterThan(0));
    expect(flightSearches()[0][1].to).toBe('TRAYT');
    expect(confirms()).toHaveLength(0);
  });

  it('an overnight flight: the action card and overview show the trip from its departure day', async () => {
    // The package flies out on DEP and checks in a day later (Bali: out Wed 6 Jan, hotel Thu
    // 7 Jan). The strip selects the departure, so every date on the page starts there too
    // (Levent, 28 Oct 2026), and the trip ends on the return flight's day.
    renderPage();
    const dayOf = (isoDate) => String(Number(isoDate.slice(8, 10)));
    const act = await waitFor(() => { const el = document.querySelector('.fc-act-date'); expect(el).toBeTruthy(); return el; });
    const [from, to] = act.textContent.split('–').map((x) => x.trim());
    expect(from.split(' ')[1]).toBe(dayOf(DEP));
    expect(to.split(' ')[1]).toBe(dayOf(CHECK_OUT));
    const overview = document.querySelector('.overview-dates').textContent.split('–')[0];
    expect(overview.match(/\d+/)[0]).toBe(dayOf(DEP));          // not the check-in day after it
  });

  it('checkout gets the flight\'s own dates and arrival airport, and the base price without SGR', async () => {
    const user = userEvent.setup();
    renderPage();
    await runCheck(user);
    await waitFor(() => expect(screen.getAllByText(/€1,500/).length).toBeGreaterThan(0));
    // The sticky sidebar card (and its 'Book now') is gone; the overview block's
    // 'Continue to checkout' is the one desktop CTA now.
    const book = screen.getAllByRole('button').find((b) => /doorgaan naar afrekenen|continue to checkout|nu boeken|boek nu|book now/i.test(b.textContent) && !b.disabled);
    await user.click(book);
    await screen.findByTestId('checkout');
    handedOver = seen.mock.calls.at(-1)[0];
    expect(handedOver.api.flight).toMatchObject({ from: 'FRA', to: 'AYT', depdate: DEP, retdate: CHECK_OUT, price: 1000, flightKeys: ['k-pkg'] });
    expect(handedOver.search).toMatchObject({ checkin: CHECK_IN, checkout: CHECK_OUT, flightTo: 'AYT', flightDepdate: DEP, flightRetdate: CHECK_OUT });
    // €1,500 for two: €750 p.p.
    expect(handedOver.ppPrice).toBe(750);
    expect(handedOver.board).toBe('ROOM ONLY');
  });
});

describe('the board on the page is the room\'s own', () => {
  it('names no board before a check, and the room\'s board after it — never an invented "All inclusive"', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await priceDays();
    const chips = () => [...container.querySelectorAll('.sd-chip')].map((c) => c.textContent);
    expect(chips().some((c) => /all inclusive/i.test(c))).toBe(false);
    await runCheck(user);
    await waitFor(() => expect(chips().some((c) => /logies|room only/i.test(c))).toBe(true));
    expect(chips().some((c) => /all inclusive/i.test(c))).toBe(false);
  });
});

describe('the strip scales on the price it prints', () => {
  it('seven days that all print €56 p.p. stand level, with no "Lowest price" (Belle Ocean, 9–15 Dec)', async () => {
    // Party totals of €112 and €111 (rounded up) both print €56 p.p. for two.
    CAL = Array.from({ length: 7 }, (_, i) => ({ date: iso(27 + i), price: i === 6 ? 110.4 : 111.54, currency: 'EUR' }));
    const { container } = renderPage('', 'hotel_only');
    const days = await priceDays();
    expect(days.every((b) => /€56/.test(b.getAttribute('aria-label')))).toBe(true);
    expect(container.querySelector('.fc-strip.fc-flat')).not.toBeNull();
    expect(container.querySelector('.fc-lowtag')).toBeNull();
  });

  it('a real difference in the printed price still draws a profile and flags the cheapest', async () => {
    CAL = Array.from({ length: 7 }, (_, i) => ({ date: iso(27 + i), price: i === 2 ? 90 : 120, currency: 'EUR' }));
    const { container } = renderPage('', 'hotel_only');
    await priceDays();
    expect(container.querySelector('.fc-strip.fc-flat')).toBeNull();
    const low = container.querySelector('.fc-lowtag');
    expect(low).not.toBeNull();
    expect(low.closest('.fc-col').getAttribute('aria-label')).toMatch(/€45/);
  });
});

describe('a package’s live price waits for its flight', () => {
  it('while the flight is checked, the room alone is never shown as the live price', async () => {
    // The flight answers only when released; the room answers at once.
    let release;
    const held = new Promise((r) => { release = r; });
    post.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('hotel-availability')) return Promise.resolve({ data: { results: { hotelbeds: { rooms: ROOMS } } } });
      if (u.includes('cached-search/confirm')) return held.then(() => ({ data: CONFIRM.data }));
      if (u.includes('flight-availability/search')) return held.then(() => ({ data: { results: { airtuerk: { flights: SEARCH } } } }));
      return Promise.resolve({ data: {} });
    });
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    // The room (€500) is in; the flight is not. No €250 p.p. or €500 total as a live price anywhere.
    await waitFor(() => expect(post.mock.calls.some(([u]) => String(u).includes('hotel-availability'))).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryAllByText(/€\s?500/).length).toBe(0);
    expect(container.querySelector('.fc-amt-live')).toBeNull();
    release();
    await waitFor(() => expect(screen.getAllByText(/€1,500/).length).toBeGreaterThan(0));
  });

  it('Hotel only still shows the room’s live price as soon as it is in', async () => {
    const user = userEvent.setup();
    renderPage('', 'hotel_only');
    await priceDays();
    await user.click(await screen.findByRole('button', { name: /prijs & beschikbaarheid controleren/i }));
    await waitFor(() => expect(screen.getAllByText(/€500/).length).toBeGreaterThan(0));
    expect(flightSearches()).toHaveLength(0);
  });
});

describe('the hotel page offers only departure airports with a package to this hotel', () => {
  it('asks for this hotel and its dates; the other-airport check probes only those airports', async () => {
    get.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('package-matrix')) return Promise.resolve({ data: MATRIX });
      if (u.includes('/feasibility')) return Promise.resolve({ data: { success: true, origins: ['FRA', 'DUS'], arrivals: { AYT: { status: 'FEASIBLE', trips: 3 } } } });
      return Promise.resolve({ data: {} });
    });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(get.mock.calls.some(([u]) => String(u).includes('/feasibility'))).toBe(true));
    const [, { params }] = get.mock.calls.find(([u]) => String(u).includes('/feasibility'));
    expect(params).toMatchObject({ destinations: 'TRAYT', hotelCode: '592205', travelDays: '9', adults: '2' });
    await runCheck(user);
    await new Promise((r) => setTimeout(r, 300));
    // The page's own search (FRA) plus the alternatives: never an airport without a package here.
    const froms = [...new Set(flightSearches().map(([, body]) => body.from))];
    expect(froms.every((f) => ['FRA', 'DUS'].includes(f))).toBe(true);
  });

  it('a departure airport that no longer makes a package stays chosen and says so', async () => {
    get.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('package-matrix')) return Promise.resolve({ data: MATRIX });
      if (u.includes('/feasibility')) return Promise.resolve({ data: { success: true, origins: ['DUS'], arrivals: { AYT: { status: 'FEASIBLE', trips: 3 } } } });
      return Promise.resolve({ data: {} });
    });
    renderPage();
    // (the suite renders in Dutch)
    await waitFor(() => expect(document.body.textContent).toMatch(/\(FRA\)[^·]*· (Niet beschikbaar|Not available)/));
    // Never swapped for DUS on its own. The chip above still reads FRA; what the matrix is
    // asked for is every airport (UI-03), because this URL carries no `origins` and so no
    // choice to honour. The page must not quietly adopt DUS as the chosen airport either way.
    const matrixCalls = get.mock.calls.filter(([u]) => String(u).includes('package-matrix'));
    expect(matrixCalls.at(-1)[1].params.origins).toBe('');
  });

  it('the airports the traveller ticked on Results are the ones the strip prices from', async () => {
    // The other half of UI-03: a real choice DOES narrow it, and survives the hand-off.
    renderPage(`&${PKG_QS}&origins=FRA,DUS`);
    await priceDays();
    const matrixCalls = get.mock.calls.filter(([u]) => String(u).includes('package-matrix'));
    expect(matrixCalls.at(-1)[1].params.origins).toBe('DUS,FRA');
  });

  it('unknown (the check failed) is never "not available"', async () => {
    get.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('package-matrix')) return Promise.resolve({ data: MATRIX });
      if (u.includes('/feasibility')) return Promise.reject(new Error('down'));
      return Promise.resolve({ data: {} });
    });
    renderPage();
    await waitFor(() => expect(get.mock.calls.some(([u]) => String(u).includes('/feasibility'))).toBe(true));
    await new Promise((r) => setTimeout(r, 300));
    expect(document.body.textContent).not.toMatch(/\(FRA\)[^·]*· (Niet beschikbaar|Not available)/);
  });
});

/**
 * UI-11 (Ch 1 §11). One vocabulary for the states, so the strip stops saying two words for
 * three different things.
 *
 * The distinction that matters: SOURCE_ERROR means we failed to ASK. Calling that "not
 * available" tells a traveller a holiday is gone when nobody ever looked, and it is the one
 * mistake the shared vocabulary exists to prevent.
 */
describe('the strip says which kind of "no price" this is', () => {
  const priced = () => ({ ...cell(DEP, CHECK_IN, 1400, [PKG_OUT], [PKG_BACK]), cheapest: true });

  it('a date the cache could not price says the price is unavailable, never "not available"', async () => {
    MATRIX = { success: true, status: 'AVAILABLE', prev: null, next: null, cells: [
      priced(),
      { date: iso(31), state: 'SOURCE_ERROR', flights: 2 },
    ] };
    renderPage();
    await priceDays();

    const failed = await screen.findByRole('button', { name: /prijs tijdelijk niet beschikbaar/i });
    expect(failed).toBeInTheDocument();
    // Not the confirmed negative, and not an invitation to check something we already failed to read.
    expect(failed.textContent).not.toMatch(/^niet beschikbaar$/i);
    expect(failed.textContent).toMatch(/prijs niet beschikbaar/i);
  });

  it('flights valid, no cached hotel price (Numa Bay, addendum 29 Oct §4): "Check price & availability", pickable, live-checks that trip', async () => {
    const user = userEvent.setup();
    const d = iso(31);
    MATRIX = { success: true, status: 'AVAILABLE', prev: null, next: null, cells: [
      priced(),
      { date: d, state: 'PRICE_UNKNOWN', flights: 2, currency: 'EUR', travelDays: 7,
        stay: { checkin: d, checkout: CHECK_OUT, nights: 6 }, departureAirport: 'FRA', arrivalAirport: 'AYT',
        flight: { price: 450, outbound: { departureDate: d, legs: [{ ...TK_OUT, departure: `${d}T06:00:00` }] }, inbound: { departureDate: CHECK_OUT, legs: [TK_BACK] } } },
    ] };
    const { container } = renderPage();
    await priceDays();

    const bar = [...container.querySelectorAll('.fc-col')].find((b) => /prijs & beschikbaarheid controleren/i.test(b.textContent));
    expect(bar).toBeTruthy();
    expect(bar.disabled).toBe(false);
    expect(bar.className).not.toMatch(/fc-empty/);
    expect(bar.textContent).not.toMatch(/niet beschikbaar/i);
    expect(bar.getAttribute('aria-label')).toMatch(/prijs & beschikbaarheid controleren/i);
    // No amount of any kind on it.
    expect(bar.textContent).not.toMatch(/€/);

    // Picking it, then the card's button: no live request before the explicit click.
    await user.click(bar);
    expect(flightSearches()).toHaveLength(0);
    const cardButton = (await screen.findAllByRole('button', { name: /prijs & beschikbaarheid controleren/i }))
      .find((b) => !b.classList.contains('fc-col'));
    await user.click(cardButton);
    await waitFor(() => expect(flightSearches().length).toBeGreaterThan(0));
    expect(flightSearches()[0][1]).toMatchObject({ from: 'FRA', to: 'AYT', depdate: d, retdate: CHECK_OUT, package: true });
  });

  it('flights exist but nothing pairs with them: not available FOR YOUR SELECTION', async () => {
    MATRIX = { success: true, status: 'AVAILABLE', prev: null, next: null, cells: [
      priced(),
      { date: iso(31), state: 'NO_VALID_COMBINATION', flights: 3 },
    ] };
    renderPage();
    await priceDays();

    expect(await screen.findByRole('button', { name: /niet beschikbaar voor jouw selectie/i })).toBeInTheDocument();
  });

  it('nothing in the period uses the shared wording, not the page\'s own', async () => {
    MATRIX = { success: true, status: 'NO_PRICED_DATE', cells: [], prev: null, next: null };
    CAL = { success: true, calendar: [] };
    renderPage();
    await waitFor(() => expect(
      screen.getByText(/geen beschikbaar verblijf gevonden binnen de huidige zoekperiode/i)
    ).toBeInTheDocument());
  });
});
