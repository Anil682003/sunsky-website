import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import HotelDetail from './HotelDetail';

// The "Care (meals)" picker must offer THIS hotel's meal plans, not a fixed list of all six.
// A hotel that only sells room-only and half board used to advertise All Inclusive, and the
// traveller discovered it was unavailable only after running a live availability check.
//
// Nothing in the content record helps: /hotels/bulk carries a `boards` field but the cache
// leaves it empty. The live availability response is the only authoritative source, so the
// list is derived from the rates it returns — and until a check has run, the picker says it
// cannot know rather than implying the six options belong to this hotel.

// Live availability: this hotel sells ROOM ONLY and HALF BOARD. No AI, no FB, no BB.
const RATES = [
  { roomName: 'Standard Double', roomCode: 'DBL.ST', boardName: 'ROOM ONLY', boardCode: 'RO', sellingRate: 268, currency: 'EUR', rateKey: 'k1', cancellationPolicies: [] },
  { roomName: 'Standard Double', roomCode: 'DBL.ST', boardName: 'HALF BOARD', boardCode: 'HB', sellingRate: 402, currency: 'EUR', rateKey: 'k2', cancellationPolicies: [] },
  { roomName: 'Sea View', roomCode: 'DBL.SV', boardName: 'ROOM ONLY', boardCode: 'RO', sellingRate: 331, currency: 'EUR', rateKey: 'k3', cancellationPolicies: [] },
];

const post = vi.fn();
vi.mock('../../services/axiosInstance', () => ({ default: { post: (...a) => post(...a), get: vi.fn(() => Promise.resolve({ data: {} })) } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../api', () => ({ useFavourites: () => ({ data: [], loading: false }), addFavourite: vi.fn(), removeFavourite: vi.fn() }));

const iso = (plusDays) => {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  return d.toISOString().slice(0, 10);
};
const CHECK_IN = iso(30);

// A 7-day calendar with real, varying prices so days are pickable.
const CALENDAR = Array.from({ length: 7 }, (_, i) => ({
  date: iso(30 + i), price: 260 + i * 12, currency: 'EUR', isLowest: i === 0,
}));

beforeEach(() => {
  post.mockReset();
  post.mockImplementation((url) => {
    if (String(url).includes('hotel-availability')) {
      return Promise.resolve({ data: { results: { hotelbeds: { rooms: RATES } } } });
    }
    return Promise.resolve({ data: {} });
  });
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('hotel-price-calendar')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ calendar: CALENDAR }) });
    }
    if (u.includes('/hotels/bulk')) {
      // `boards: []` is what the live cache actually returns — the reason the list cannot
      // be built from hotel content.
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{ hotelCode: '300984', name: 'Test Hotel', stars: 4, boards: [], images: [], facilities: [] }]) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false }, reducers: {} });
const makeStore = () => configureStore({ reducer: { auth: auth.reducer } });

const renderPage = () => render(
  <Provider store={makeStore()}>
    <MemoryRouter initialEntries={[`/hotel/300984?checkIn=${CHECK_IN}&checkOut=${iso(37)}&adults=2&children=0&rooms=1&nights=7&destination=AYT&name=Test+Hotel`]}>
      <Routes><Route path="/hotel/:hotelCode" element={<HotelDetail />} /></Routes>
    </MemoryRouter>
  </Provider>
);

const openMeals = async (user) => {
  const trigger = await screen.findByRole('button', { name: /care \(meals\)/i });
  await user.click(trigger);
  return screen.getByRole('dialog', { name: /care \(meals\)/i });
};

describe('Care (meals) offers what the hotel sells', () => {
  it('says it cannot know the meal plans until a date has been checked', async () => {
    const user = userEvent.setup();
    renderPage();
    const pop = await openMeals(user);
    expect(pop).toHaveTextContent(/check a date to see which meal plans/i);
  });

  it('lists only the boards the hotel returned, with the cheapest price on each', async () => {
    const user = userEvent.setup();
    renderPage();

    // pick a day, then run the availability check
    const days = await waitFor(() => {
      const found = screen.getAllByRole('button', { name: /from €\d+/i });
      expect(found.length).toBeGreaterThan(0);
      return found;
    });
    await user.click(days[0]);
    await user.click(await screen.findByRole('button', { name: /check price & availability/i }));
    await waitFor(() => expect(post).toHaveBeenCalled());

    const pop = await openMeals(user);
    await waitFor(() => expect(pop).toHaveTextContent(/meal plans this hotel offers/i));

    // offered, cheapest rate on each board
    expect(within(pop).getByRole('button', { name: /room only/i })).toHaveTextContent('268');
    expect(within(pop).getByRole('button', { name: /half board/i })).toHaveTextContent('402');
    expect(within(pop).getByRole('button', { name: /no preference/i })).toBeInTheDocument();

    // never offered for this hotel
    expect(within(pop).queryByRole('button', { name: /all inclusive/i })).toBeNull();
    expect(within(pop).queryByRole('button', { name: /full board/i })).toBeNull();
    expect(within(pop).queryByRole('button', { name: /bed & breakfast/i })).toBeNull();
  });
});
