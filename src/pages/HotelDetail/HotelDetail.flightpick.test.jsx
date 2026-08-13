import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import HotelDetail from './HotelDetail';

// Choosing a flight, as seen in the change-flight modal.
//
// Two faults lived here together, and they made each other worse.
//
// 1. GREEN WAS ON THE WRONG CARD. Green is this page's "you picked this" colour — the chosen
//    room wears it, and so does the flight card's own "Selected" badge. But the green FRAME
//    was wired to `cheapest`, not to `selected`. So the cheapest fare sat in green whether or
//    not it was chosen: move to any other flight and two cards were lit at once, the green one
//    on a flight the traveller had just moved away from, the blue one on the flight they were
//    actually buying.
//
// 2. THE SAME FLIGHT, FOUR TIMES. Airtuerk prices one row per fare class, so one aircraft came
//    back as four cards — identical times, identical baggage, €1,112 / €1,120 / €1,120 /
//    €1,128. Two of them did not differ even in price. Nothing on the card told them apart,
//    because nothing about them WAS different.

const post = vi.fn();
const showToast = vi.fn();
vi.mock('../../services/axiosInstance', () => ({
  default: { post: (...a) => post(...a), get: vi.fn(() => Promise.resolve({ data: {} })) },
  SUPPLIER_TIMEOUT: 25000,
}));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../../api', () => ({
  useFavourites: () => ({ data: [], loading: false }), addFavourite: vi.fn(), removeFavourite: vi.fn(),
}));

const iso = (plusDays) => {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  return d.toISOString().slice(0, 10);
};
const CHECK_IN = iso(30);
const CHECK_OUT = iso(37);

const RATES = [
  { roomName: 'Sea View Double', roomCode: 'DBL.SV', boardName: 'ALL INCLUSIVE', boardCode: 'AI', sellingRate: 1180, currency: 'EUR', rateKey: 'k1', cancellationPolicies: [] },
];
const CALENDAR = Array.from({ length: 7 }, (_, i) => ({
  date: iso(27 + i), price: 260 + i * 12, currency: 'EUR', isLowest: i === 0,
}));

// The 17:40 SunExpress out of Brussels from the screenshot, and its 11:25 return.
const OUT_1740 = {
  from: 'BRU', to: 'ADB', airline: 'XQ', flightNumber: '1653',
  departure: `${CHECK_IN}T17:40:00`, arrival: `${CHECK_IN}T22:00:00`, duration: 200,
};
const RET_1125 = {
  from: 'ADB', to: 'BRU', airline: 'XQ', flightNumber: '1652',
  departure: `${CHECK_OUT}T11:25:00`, arrival: `${CHECK_OUT}T14:05:00`, duration: 220,
};
// A genuinely different aircraft: an early-morning departure. This one must survive.
const OUT_0615 = { ...OUT_1740, flightNumber: '1655', departure: `${CHECK_IN}T06:15:00`, arrival: `${CHECK_IN}T10:35:00` };

// One bookable fare class, as the supplier sends it.
const fare = (totalPrice, out, key) => ({
  totalPrice, currency: 'EUR',
  outbound: { legs: [out] },
  inbound: { legs: [RET_1125] },
  flightKeys: [key],
  baggage: { checkedKg: 20, checkedPieces: 0, handKg: 0 },
});

// Four fare classes on the 17:40 (what the screenshot showed), plus one real alternative.
let FLIGHTS = [
  fare(1112, OUT_1740, 'k-1112'),
  fare(1120, OUT_1740, 'k-1120a'),
  fare(1120, OUT_1740, 'k-1120b'),
  fare(1128, OUT_1740, 'k-1128'),
  fare(1150, OUT_0615, 'k-0615'),
];

beforeEach(() => {
  post.mockReset();
  showToast.mockReset();
  post.mockImplementation((url) => {
    const u = String(url);
    if (u.includes('hotel-availability')) {
      return Promise.resolve({ data: { results: { hotelbeds: { rooms: RATES } } } });
    }
    if (u.includes('flight-availability')) {
      return Promise.resolve({ data: { results: { airtuerk: { flights: FLIGHTS } } } });
    }
    return Promise.resolve({ data: {} });
  });
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('hotel-price-calendar')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ calendar: CALENDAR }) });
    }
    if (u.includes('/hotels/bulk')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{ hotelCode: '300984', name: 'Test Hotel', stars: 4, images: [], facilities: [] }]) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false }, reducers: {} });
const makeStore = () => configureStore({ reducer: { auth: auth.reducer } });

// No `transport` param — the page defaults to `package`, which is what runs a flight search.
const renderPage = () => render(
  <Provider store={makeStore()}>
    <MemoryRouter initialEntries={[`/hotel/300984?checkIn=${CHECK_IN}&checkOut=${CHECK_OUT}&adults=2&children=0&rooms=1&nights=7&destination=ADB&name=Test+Hotel`]}>
      <Routes>
        <Route path="/hotel/:hotelCode" element={<HotelDetail />} />
        <Route path="/checkout" element={<div data-testid="checkout">CHECKOUT</div>} />
      </Routes>
    </MemoryRouter>
  </Provider>
);

// Price a day, which is what sends both the room and the flight search.
const runCheck = async (user) => {
  const days = await waitFor(() => {
    const found = screen.getAllByRole('button', { name: /from €\d+/i });
    expect(found.length).toBeGreaterThan(0);
    return found;
  });
  await user.click(days[0]);
  await user.click(await screen.findByRole('button', { name: /check price & availability/i }));
  await waitFor(() => expect(post).toHaveBeenCalledWith(
    expect.stringContaining('flight-availability'), expect.anything(), expect.anything(),
  ));
};

// The cards inside the modal only — the page itself also renders the chosen flight as a card.
const modalCards = (container) => [...container.querySelectorAll('.modal-flights .flight-card')];

describe('the change-flight modal lists flights, not fare classes', () => {
  it('collapses four fare classes on one aircraft into one card', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);

    await waitFor(() => expect(modalCards(container).length).toBeGreaterThan(0));
    // Five rows in, two real choices out: the 17:40 and the 06:15.
    expect(modalCards(container)).toHaveLength(2);
  });

  it('keeps the cheapest of the collapsed group', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);

    await waitFor(() => expect(modalCards(container).length).toBe(2));
    // €1,112, not €1,120 or €1,128 — and the dearer twins are gone from the list.
    expect(modalCards(container)[0].textContent).toContain('1,112');
    expect(container.querySelector('.modal-flights').textContent).not.toContain('1,128');
  });

  it('counts the real options in the "Change flight" button', async () => {
    const user = userEvent.setup();
    renderPage();
    await runCheck(user);
    // One alternative to the chosen flight — not four.
    expect(await screen.findByRole('button', { name: /change flight · 1 more option$/i })).toBeInTheDocument();
  });
});

describe('green marks the flight you chose, and only that one', () => {
  it('starts with the selected flight in green and nothing else', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(modalCards(container).length).toBe(2));

    const green = modalCards(container).filter((c) => c.classList.contains('selected'));
    expect(green).toHaveLength(1);
    // The default pick is the cheapest, so it is the one holding the green frame — and it
    // must NOT also carry `cheapest`, the class that now paints blue.
    expect(green[0].textContent).toContain('1,112');
    expect(green[0].classList.contains('cheapest')).toBe(false);
  });

  it('moves the green to the newly chosen flight and turns the old one blue', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(modalCards(container).length).toBe(2));

    const [cheapest, alternative] = modalCards(container);
    await user.click(alternative.querySelector('.flight-select-btn'));

    await waitFor(() => expect(alternative.classList.contains('selected')).toBe(true));
    // The card just left behind gives the green frame up...
    expect(cheapest.classList.contains('selected')).toBe(false);
    // ...and falls back to the blue "cheapest" marking rather than staying lit in green.
    expect(cheapest.classList.contains('cheapest')).toBe(true);
    // Still exactly one green card on screen — the whole point.
    expect(modalCards(container).filter((c) => c.classList.contains('selected'))).toHaveLength(1);
  });
});
