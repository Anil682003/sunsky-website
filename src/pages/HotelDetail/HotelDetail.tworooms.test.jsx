import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import HotelDetail from './HotelDetail';

/**
 * "Please verify" (backlog), Ch2 §5: two rooms always get one common board. Mixed boards are
 * never offered, even where a supplier would allow them, and changing the board changes it for
 * every room at once.
 *
 * On this page that holds by construction rather than by a check, and these tests pin the
 * construction so it cannot quietly come apart:
 *
 *   - the live search asks ONCE for the whole party with `rooms: 2`, so every rate that comes
 *     back is one room type on one board for both rooms;
 *   - the selection is ONE rate (`selectedRoom.live` is a single index), so there is no second
 *     pick that could carry a second board;
 *   - the checkout is handed that one rate: one rateKey, one boardCode, `rooms: 2`. There is no
 *     per-room list in the hand-off for a different board to hide in.
 *
 * A per-room picker added later would have to break the last assertion here to exist.
 */

const RATES = [
  { roomName: 'Double Room', roomCode: 'DBL', boardName: 'ROOM ONLY', boardCode: 'RO', sellingRate: 800, currency: 'EUR', rateKey: 'r-ro', cancellationPolicies: [] },
  { roomName: 'Double Room', roomCode: 'DBL', boardName: 'HALF BOARD', boardCode: 'HB', sellingRate: 1100, currency: 'EUR', rateKey: 'r-hb', cancellationPolicies: [] },
  { roomName: 'Family Room', roomCode: 'FAM', boardName: 'ALL INCLUSIVE', boardCode: 'AI', sellingRate: 1500, currency: 'EUR', rateKey: 'r-ai', cancellationPolicies: [] },
];

const post = vi.fn();
vi.mock('../../services/axiosInstance', () => ({ default: { post: (...a) => post(...a), get: vi.fn(() => Promise.resolve({ data: {} })) }, SUPPLIER_TIMEOUT: 25000 }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../api', () => ({
  useFavourites: () => ({ data: [], loading: false }), addFavourite: vi.fn(), removeFavourite: vi.fn(),
  fetchFavouriteCodes: vi.fn(() => Promise.resolve(new Set())),
}));

const iso = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const CHECK_IN = iso(30);
const CALENDAR = Array.from({ length: 7 }, (_, i) => ({ date: iso(27 + i), price: 800 + i * 9, currency: 'EUR', isLowest: false }));

beforeEach(() => {
  post.mockReset();
  post.mockImplementation((url) => (String(url).includes('hotel-availability')
    ? Promise.resolve({ data: { results: { hotelbeds: { rooms: RATES } } } })
    : Promise.resolve({ data: {} })));
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('hotel-price-calendar')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ calendar: CALENDAR }) });
    if (u.includes('/hotels/bulk')) return Promise.resolve({ ok: true, json: () => Promise.resolve([{ hotelCode: '165406', name: 'Test Hotel', stars: 5, images: [], facilities: [] }]) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false }, reducers: {} });
const seen = vi.fn();
function CheckoutStub() {
  const booking = useLocation().state?.booking || null;
  useEffect(() => { seen(booking); }, [booking]);
  return <div data-testid="checkout">CHECKOUT</div>;
}
// Two rooms, two adults in each, own transport.
const renderPage = () => render(
  <Provider store={configureStore({ reducer: { auth: auth.reducer } })}>
    <MemoryRouter initialEntries={[`/hotel/165406?checkIn=${CHECK_IN}&checkOut=${iso(37)}&adults=4&children=0&rooms=2&nights=7&destination=BJV&name=Test+Hotel&transport=hotel_only`]}>
      <Routes>
        <Route path="/hotel/:hotelCode" element={<HotelDetail />} />
        <Route path="/checkout" element={<CheckoutStub />} />
      </Routes>
    </MemoryRouter>
  </Provider>
);

const checkFirstDay = async (user) => {
  const days = await waitFor(() => {
    const f = screen.getAllByRole('button', { name: /vanaf €\d+/i });
    expect(f.length).toBeGreaterThan(0);
    return f;
  });
  await user.click(days[0]);
  await user.click(await screen.findByRole('button', { name: /prijs & beschikbaarheid controleren/i }));
  await waitFor(() => expect(post).toHaveBeenCalled());
};
const options = (container) => [...container.querySelectorAll('.room-option')];
const optionWith = (container, re) => options(container).find((o) => re.test(o.textContent));
const book = async (user) => {
  const btn = await waitFor(() => {
    const b = screen.getAllByRole('button').find((x) => /doorgaan naar afrekenen|continue to checkout|nu boeken|boek nu|book now/i.test(x.textContent) && !x.disabled);
    expect(b).toBeTruthy();
    return b;
  });
  await user.click(btn);
  await screen.findByTestId('checkout');
  return seen.mock.calls.at(-1)[0];
};

describe('two rooms always share one board (Ch2 §5)', () => {
  it('one live question for both rooms, so every rate offered is one board for both', async () => {
    const user = userEvent.setup();
    renderPage();
    await checkFirstDay(user);
    const asked = post.mock.calls.filter(([u]) => String(u).includes('hotel-availability'));
    expect(asked).toHaveLength(1);
    expect(asked[0][1]).toMatchObject({ adults: 4, rooms: 2 });
  });

  it('picking half board books half board for both rooms: one rate, one board, two rooms', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);
    const hb = await waitFor(() => {
      const el = optionWith(container, /half\s*board|halfpension/i);
      expect(el).toBeTruthy();
      return el;
    });
    await user.click(hb);

    const handedOver = await book(user);
    const hotel = handedOver.api.hotel;
    expect(hotel).toMatchObject({ rooms: 2, rateKey: 'r-hb', boardCode: 'HB', roomCode: 'DBL' });
    // The count is a number, never a per-room list: there is nowhere for a second board to go.
    expect(Array.isArray(hotel.rooms)).toBe(false);
    expect(handedOver.search).toMatchObject({ rooms: 2, boardCode: 'HB', roomCode: 'DBL' });
  });

  it('changing the board changes it for both rooms, and re-picks the cheapest rate on it', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);
    await waitFor(() => expect(optionWith(container, /room\s*only|logies/i)).toBeTruthy());

    // Meals → All inclusive. One choice for the booking, not one per room.
    await user.click(await screen.findByRole('button', { name: /verzorging \(maaltijden\)/i }));
    const pop = screen.getByRole('dialog', { name: /verzorging \(maaltijden\)/i });
    await user.click([...pop.querySelectorAll('button')].find((b) => /all inclusive/i.test(b.textContent)));

    // Only all-inclusive rates are left to choose from, so no mix is even on screen.
    await waitFor(() => expect(options(container).length).toBeGreaterThan(0));
    await waitFor(() => expect(options(container).every((o) => /all\s*inclusive/i.test(o.textContent))).toBe(true));

    const handedOver = await book(user);
    expect(handedOver.api.hotel).toMatchObject({ rooms: 2, rateKey: 'r-ai', boardCode: 'AI' });
  });
});
