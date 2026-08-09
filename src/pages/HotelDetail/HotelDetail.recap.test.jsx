import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import HotelDetail from './HotelDetail';

// The green "your holiday is available" card spells the trip out: departure, return, airport,
// board and transfer, each labelled, the way the confirmation the traveller gets later does.
// It used to be one dot-separated line ("Selected Mon 7 Sep · 6 days · 2 adults"), which left
// the three facts people actually re-read before paying — which airport, which meal plan,
// whether a transfer is in the price — either buried further down the page or nowhere at all.
//
// Every value is DERIVED. The board is the one on the live rate that produced the price in
// the same card, never the six-item preference list; the transfer says it has to be added
// rather than implying an airport pickup nobody has chosen.

// The cheapest rate is All Inclusive — so that, and not the traveller's (unset) board
// preference, is what the recap must name.
const RATES = [
  { roomName: 'Double Room Sea View', roomCode: 'DBL.SV', boardName: 'All Inclusive', boardCode: 'AI', sellingRate: 384, currency: 'EUR', rateKey: 'k1', cancellationPolicies: [] },
  { roomName: 'Superior Room', roomCode: 'SUP', boardName: 'Half Board', boardCode: 'HB', sellingRate: 441, currency: 'EUR', rateKey: 'k2', cancellationPolicies: [] },
];
const SERVICES = [{ vehicle: 'Minibus', transferType: 'SHARED', price: 38, currency: 'EUR' }];

const post = vi.fn();
vi.mock('../../services/axiosInstance', () => ({ default: { post: (...a) => post(...a), get: vi.fn(() => Promise.resolve({ data: {} })) }, SUPPLIER_TIMEOUT: 25000 }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../api', () => ({ useFavourites: () => ({ data: [], loading: false }), addFavourite: vi.fn(), removeFavourite: vi.fn() }));

const iso = (plusDays) => {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  return d.toISOString().slice(0, 10);
};
const CHECK_IN = iso(30);
const NIGHTS = 7;
const RETURN_ON = iso(30 + NIGHTS);

// Independent of the component's own formatter, so a change to either side shows up here.
const expectDay  = (i) => new Date(`${i}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });
const expectDate = (i) => {
  const d = new Date(`${i}T00:00:00`);
  return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleDateString('en-GB', { month: 'long' })} ${d.getFullYear()}`;
};

const CALENDAR = Array.from({ length: 7 }, (_, i) => ({
  date: iso(30 + i), price: 380 + i * 9, currency: 'EUR', isLowest: i === 0,
}));

beforeEach(() => {
  post.mockReset();
  post.mockImplementation((url) => {
    const u = String(url);
    if (u.includes('hotel-availability')) return Promise.resolve({ data: { results: { hotelbeds: { rooms: RATES } } } });
    if (u.includes('transfer-availability')) return Promise.resolve({ data: { results: { hotelbeds: { services: SERVICES } } } });
    return Promise.resolve({ data: {} });
  });
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('hotel-price-calendar')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ calendar: CALENDAR }) });
    if (u.includes('/hotels/bulk')) return Promise.resolve({ ok: true, json: () => Promise.resolve([{ hotelCode: '300984', name: 'Test Hotel', stars: 4, images: [], facilities: [] }]) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false }, reducers: {} });
const makeStore = () => configureStore({ reducer: { auth: auth.reducer } });

const renderPage = () => render(
  <Provider store={makeStore()}>
    <MemoryRouter initialEntries={[`/hotel/300984?checkIn=${CHECK_IN}&checkOut=${RETURN_ON}&adults=2&children=0&rooms=1&nights=${NIGHTS}&destination=AYT&name=Test+Hotel&origin=BRU`]}>
      <Routes><Route path="/hotel/:hotelCode" element={<HotelDetail />} /></Routes>
    </MemoryRouter>
  </Provider>
);

// Pick the first priced day in the strip and run the live check.
const checkFirstDay = async (user) => {
  const days = await waitFor(() => {
    const found = screen.getAllByRole('button', { name: /from €\d+/i });
    expect(found.length).toBeGreaterThan(0);
    return found;
  });
  await user.click(days[0]);
  await user.click(await screen.findByRole('button', { name: /check price & availability/i }));
  await waitFor(() => expect(post).toHaveBeenCalled());
};

describe('the availability card spells the trip out', () => {
  it('names the departure, return, airport, board and transfer', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);

    await screen.findByText(/your holiday is available/i);
    const facts = await waitFor(() => {
      const el = container.querySelector('.fc-facts');
      expect(el).toBeTruthy();
      return el;
    });

    // Each value read off UNDER ITS OWN LABEL: a seven-night trip departs and returns on the
    // same weekday, so a page-wide text match would pass on the wrong row.
    const row = (label) => {
      const found = [...facts.querySelectorAll('.fcu-item')]
        .find((el) => el.querySelector('.fcu-k')?.textContent.trim().toLowerCase() === label);
      expect(found, `no "${label}" row`).toBeTruthy();
      return found;
    };

    // Dates in full — a weekday and "07 September 2026", not "7 Sep".
    expect(row('departure')).toHaveTextContent(expectDay(CHECK_IN));
    expect(row('departure')).toHaveTextContent(expectDate(CHECK_IN));
    expect(row('return')).toHaveTextContent(expectDay(RETURN_ON));
    expect(row('return')).toHaveTextContent(expectDate(RETURN_ON));

    // The searched departure airport, resolved from the code.
    expect(row('airport')).toHaveTextContent('Brussels (BRU)');

    // The board on the rate that priced the card — the traveller set no preference.
    expect(row('board type')).toHaveTextContent('All inclusive');

    // Booked on the checkout page, not here — and never implied to be in the price.
    expect(row('transfer')).toHaveTextContent(/to be booked on the next page/i);
  });

  it('follows the room the traveller picks, not the cheapest one', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);

    const facts = await waitFor(() => {
      const el = container.querySelector('.fc-facts');
      expect(el).toBeTruthy();
      return el;
    });
    const boardRow = () => [...facts.querySelectorAll('.fcu-item')]
      .find((el) => el.querySelector('.fcu-k')?.textContent.trim().toLowerCase() === 'board type');

    const quoted = () => container.querySelector('.avail-price-val')?.textContent;

    // Opens on the cheapest rate.
    await waitFor(() => expect(boardRow()).toHaveTextContent('All inclusive'));
    expect(quoted()).toBe('€384');

    // Upgrading to half board re-prices the card AND renames the board with it — the recap
    // is a statement about the rate that is selected, so the two can never disagree.
    const hb = await waitFor(() => {
      const found = [...container.querySelectorAll('.room-option')].find((el) => /half board/i.test(el.textContent));
      expect(found).toBeTruthy();
      return found;
    });
    await user.click(hb);

    await waitFor(() => expect(boardRow()).toHaveTextContent('Half board'));
    expect(boardRow()).not.toHaveTextContent('All inclusive');
    expect(quoted()).toBe('€441');
  });

  it('quotes the board of the rate it quotes the price of', async () => {
    // Half board only: the recap must follow the rate, not name a plan the hotel never sold.
    post.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('hotel-availability')) {
        return Promise.resolve({ data: { results: { hotelbeds: { rooms: [RATES[1]] } } } });
      }
      return Promise.resolve({ data: {} });
    });
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);

    const facts = await waitFor(() => {
      const el = container.querySelector('.fc-facts');
      expect(el).toBeTruthy();
      return el;
    });
    await waitFor(() => expect(within(facts).getByText('Half board')).toBeInTheDocument());
    expect(within(facts).queryByText('All inclusive')).toBeNull();
  });
});
