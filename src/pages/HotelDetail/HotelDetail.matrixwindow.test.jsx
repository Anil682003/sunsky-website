import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import HotelDetail from './HotelDetail';

/**
 * "Please verify" (backlog), the hotel page's package matrix and the window around the date:
 *
 *   Ch1 §7               clicking a cell moves the window with it and keeps the flexibility mode.
 *                        The contract's example: 25 Oct ±3, click 30 Oct, the window becomes
 *                        27 Oct to 2 Nov;
 *   Unified Results T29  a date outside the flexibility window is an alternative, and leaves the
 *                        SearchContext unchanged until it is clicked.
 *
 * The matrix stub answers seven dates centred on whatever date it is asked for, as the admin's
 * /package-matrix does where the calendar allows, so "the window moved" can be read straight off
 * the strip and off the question that produced it.
 */

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
const offsetOf = (date) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${iso(0)}T00:00:00Z`)) / 86400000);
const addDays = (date, n) => iso(offsetOf(date) + n);

// Every date its own price (so a bar can be told apart by what it prints) and, on odd days, its
// own airport: with several airports competing (UI-03) neighbouring dates leave from different
// ones, which is exactly the case where picking a date adopts something besides the date. Some
// dates' packages also stay a night less (the flight times decide the stay), the other thing a
// pick takes with it.
const ppOn = (date) => 500 + offsetOf(date) * 10;
const fromOn = (date) => (offsetOf(date) % 2 ? 'DUS' : 'FRA');
const nightsOn = (date) => (offsetOf(date) % 5 === 2 ? 6 : 7);
const legs = (from, to, at) => [{ from, to, airline: 'XQ', flightNumber: `XQ${100 + offsetOf(at.slice(0, 10))}`, departure: at, arrival: at, duration: 200 }];
const cellOn = (date) => {
  const checkout = addDays(date, nightsOn(date));
  return {
    date, state: 'AVAILABLE', offerValidation: 'INDICATIVE',
    sunskyPayableTotal: ppOn(date) * 2, pricePerPerson: ppOn(date), currency: 'EUR', travelDays: nightsOn(date) + 1,
    stay: { checkin: date, checkout, nights: nightsOn(date) }, departureAirport: fromOn(date), arrivalAirport: 'AYT', room: 'DBL', board: 'RO',
    flight: {
      price: 400,
      outbound: { departureDate: date, legs: legs(fromOn(date), 'AYT', `${date}T08:00:00`) },
      inbound: { departureDate: checkout, legs: legs('AYT', fromOn(date), `${checkout}T12:00:00`) },
    },
    cheapest: false,
  };
};
/** /package-matrix: seven dates, three either side of the one asked. */
const matrixAround = (date) => ({
  success: true, status: 'AVAILABLE', prev: addDays(date, -7), next: addDays(date, 7),
  cells: [-3, -2, -1, 0, 1, 2, 3].map((d) => cellOn(addDays(date, d))),
});

const START = iso(30);           // the searched departure (a day flight: departure = check-in)
const NIGHTS = 7;
const matrixCalls = () => get.mock.calls.filter(([u]) => String(u).includes('package-matrix')).map(([, o]) => o.params);
const flightSearches = () => post.mock.calls.filter(([u]) => String(u).includes('flight-availability/search')).map(([, b]) => b);
const confirms = () => post.mock.calls.filter(([u]) => String(u).includes('cached-search/confirm')).map(([, b]) => b);
const liveChecks = () => post.mock.calls.filter(([u]) => String(u).includes('hotel-availability'));

beforeEach(() => {
  post.mockReset();
  get.mockReset();
  window.history.replaceState(null, '', '/');
  get.mockImplementation((url, opts) => (String(url).includes('package-matrix')
    ? Promise.resolve({ data: matrixAround(opts.params.date) })
    : Promise.resolve({ data: {} })));
  post.mockImplementation((url, body) => {
    const u = String(url);
    if (u.includes('hotel-availability')) return Promise.resolve({ data: { results: { hotelbeds: { rooms: [{ roomName: 'Double Room', roomCode: 'DBL', boardName: 'ROOM ONLY', boardCode: 'RO', sellingRate: 600, currency: 'EUR', rateKey: 'r1', cancellationPolicies: [] }] } } } });
    // The confirm finds the package's own flight, whichever airport it leaves from.
    if (u.includes('cached-search/confirm')) {
      const out = body.outbound.legs[0];
      const back = body.inbound.legs[0];
      const leg = (l, from, to) => ({ from, to, airline: l.airline, flightNumber: `XQ${l.flightNumber}`, departure: `${l.departure}:00`, arrival: `${l.departure}:00`, duration: 200 });
      return Promise.resolve({ data: { success: true, status: 'CONFIRMED', flight: {
        totalPrice: 400, currency: 'EUR', flightKeys: ['k'], baggage: { checkedKg: 20, checkedPieces: 0, handKg: 8 },
        outbound: { legs: [leg(out, body.from, body.to)] }, inbound: { legs: [leg(back, body.to, body.from)] },
      } } });
    }
    return Promise.resolve({ data: {} });
  });
  globalThis.fetch = vi.fn((url) => {
    if (String(url).includes('/hotels/bulk')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ hotelCode: '592205', name: 'Royal Test', stars: 5, images: [], facilities: [] }] }) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

// What a results card hands over for a ±2-day Flight + Hotel search with two airports ticked and
// non-stop only: the stay and airport of the card's package, and the package itself.
const pkgOf = (date) => {
  const c = cellOn(date);
  return [
    `pkgOut=XQ%7C${100 + offsetOf(date)}%7C${encodeURIComponent(`${date}T08:00`)}`,
    `pkgBack=XQ%7C${100 + offsetOf(c.stay.checkout)}%7C${encodeURIComponent(`${c.stay.checkout}T12:00`)}`,
    `pkgDep=${date}`, `pkgRet=${c.stay.checkout}`, `pkgFrom=${fromOn(date)}`, 'pkgTo=AYT', 'pkgFlight=400', 'pkgDays=8',
  ].join('&');
};
const ENTRY = `/hotel/592205?checkIn=${START}&checkOut=${addDays(START, NIGHTS)}&adults=2&children=1&childAges=8&rooms=1&nights=${NIGHTS}`
  + `&destination=AYT&name=Royal+Test&origin=FRA&origins=FRA,DUS&routing=nonstop&flex=2&transport=package&total=${ppOn(START) * 2}&${pkgOf(START)}`;

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false }, reducers: {} });
// The page writes its context back into the REAL address bar (window.location, not the router's
// memory), so the address bar starts where a browser would have it: on the link that was opened.
const renderPage = () => (window.history.replaceState(null, '', ENTRY), render(
  <Provider store={configureStore({ reducer: { auth: auth.reducer } })}>
    <MemoryRouter initialEntries={[ENTRY]}>
      <Routes><Route path="/hotel/:hotelCode" element={<HotelDetail />} /></Routes>
    </MemoryRouter>
  </Provider>
));

/** The strip's dates in order, read back from the per-person price each bar prints. */
const stripDates = () => screen.getAllByRole('button', { name: /vanaf €\d+/i })
  .map((b) => iso((Number(/vanaf €(\d+)/i.exec(b.getAttribute('aria-label'))[1]) - 500) / 10));
const barOn = (date) => screen.getAllByRole('button', { name: /vanaf €\d+/i })
  .find((b) => new RegExp(`vanaf €${ppOn(date)}\\b`).test(b.getAttribute('aria-label')));
const pressed = () => {
  const b = screen.getAllByRole('button', { name: /vanaf €\d+/i }).find((x) => x.getAttribute('aria-pressed') === 'true');
  return b ? iso((Number(/vanaf €(\d+)/i.exec(b.getAttribute('aria-label'))[1]) - 500) / 10) : null;
};
const around = (date) => [-3, -2, -1, 0, 1, 2, 3].map((d) => addDays(date, d));

describe('an alternative date leaves the SearchContext alone until it is clicked (Unified Results T29)', () => {
  it('seven dates on screen, four of them outside ±2: nothing is selected, asked or rewritten for them', async () => {
    renderPage();
    await waitFor(() => expect(stripDates()).toEqual(around(START)));
    // Let anything that might react to the answer have its turn.
    await new Promise((r) => setTimeout(r, 300));

    // The searched date is the one selected; START+3 and START-3 (outside ±2) are only shown.
    expect(pressed()).toBe(START);
    // One question, about the searched date. A date on screen is not a date asked about.
    expect(matrixCalls()).toHaveLength(1);
    expect(matrixCalls()[0]).toMatchObject({ date: START, origins: 'DUS,FRA', routing: 'nonstop' });
    // No live call for any of them, and the address bar (the SearchContext's serialized form)
    // still says what the results card sent.
    expect(liveChecks()).toHaveLength(0);
    expect(window.location.pathname + window.location.search).toBe(ENTRY);
  });

  it('clicked, an alternative becomes the selected date', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(stripDates()).toEqual(around(START)));
    const alt = addDays(START, 3);

    await user.click(barOn(alt));
    await waitFor(() => expect(pressed()).toBe(alt));
    expect(matrixCalls().at(-1).date).toBe(alt);
    // Picking is not checking: still no supplier call until the traveller asks for one.
    expect(liveChecks()).toHaveLength(0);
  });
});

describe('clicking a matrix date moves the window with it and keeps the mode (Ch1 §7)', () => {
  it('the window re-centres on the clicked date: three before it, three after', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(stripDates()).toEqual(around(START)));

    const alt = addDays(START, 3);
    await user.click(barOn(alt));
    await waitFor(() => expect(stripDates()).toEqual(around(alt)));
    expect(pressed()).toBe(alt);

    // And again from there: the window follows every pick, not only the first.
    const further = addDays(alt, 3);
    await user.click(barOn(further));
    await waitFor(() => expect(stripDates()).toEqual(around(further)));
    expect(pressed()).toBe(further);
  });

  it('only the date moves: trip length, airports, routing and party stay what was searched', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(stripDates()).toEqual(around(START)));
    const before = matrixCalls()[0];

    // START+3 is a DUS date while the card came from FRA, so the pick adopts that date's
    // airport for the OFFER (UI-03). It must not narrow what the strip compares.
    const alt = addDays(START, 3);
    await user.click(barOn(alt));
    await waitFor(() => expect(matrixCalls().at(-1).date).toBe(alt));
    const after = matrixCalls().at(-1);
    expect(after).toEqual({ ...before, date: alt });
  });

  it('the picked date brings its own airport: the live check asks THAT package, not the card airport on a new day', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(stripDates()).toEqual(around(START)));
    // The week leaves from two airports, so each column names its own (UI-03), in its
    // aria-label as well, since that replaces the button's inner text for a screen reader.
    const airportsOnStrip = () => screen.getAllByRole('button', { name: /vanaf €\d+/i })
      .map((b) => (/vertrek vanaf ([A-Z]{3})/.exec(b.getAttribute('aria-label')) || [])[1] || null);
    await waitFor(() => expect(airportsOnStrip()).toEqual(around(START).map(fromOn)));

    const alt = addDays(START, 3);                 // a DUS date; the card's package left from FRA
    expect(fromOn(alt)).toBe('DUS');
    await user.click(barOn(alt));
    await waitFor(() => expect(pressed()).toBe(alt));
    await user.click(await screen.findByRole('button', { name: /prijs & beschikbaarheid controleren/i }));
    await waitFor(() => expect(flightSearches().length).toBeGreaterThan(0));

    // From DUS, on that date, and that date's package confirmed: the offer is the cell clicked.
    // Asked from FRA instead, it priced a flight nobody had quoted on that date, and the
    // package behind the bar was never confirmed at all.
    // (The first search: an empty answer sends the page probing other airports afterwards.)
    expect(flightSearches()[0]).toMatchObject({ from: 'DUS', depdate: alt });
    await waitFor(() => expect(confirms().length).toBeGreaterThan(0));
    expect(confirms()[0]).toMatchObject({ from: 'DUS', depdate: alt });
  });

  it('after the click the SearchContext names the clicked trip, with the flexibility it was searched with', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(stripDates()).toEqual(around(START)));

    // START+2: a 6-night package (the card's was 7), so the pick changes the stay as well.
    const alt = addDays(START, 2);
    expect(nightsOn(alt)).toBe(6);
    await user.click(barOn(alt));
    await waitFor(() => expect(pressed()).toBe(alt));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('checkIn')).not.toBe(START));

    // The address bar is what a refresh re-opens. It used to keep the OLD date with the new
    // stay length: a refresh then priced a trip that was neither the one searched nor the one
    // clicked. The card's package belongs to the card's date and leaves with it.
    const q = new URLSearchParams(window.location.search);
    expect([q.get('checkIn'), q.get('checkOut'), q.get('nights')]).toEqual([alt, addDays(alt, 6), '6']);
    expect(q.get('pkgDep')).toBeNull();
    expect(q.get('total')).toBeNull();
    // Everything not about the date is the search's, untouched: the ± days included.
    expect(q.get('flex')).toBe('2');
    expect(q.get('origins')).toBe('FRA,DUS');
    expect(q.get('routing')).toBe('nonstop');
    expect([q.get('adults'), q.get('children'), q.get('childAges'), q.get('rooms')]).toEqual(['2', '1', '8', '1']);
  });
});
