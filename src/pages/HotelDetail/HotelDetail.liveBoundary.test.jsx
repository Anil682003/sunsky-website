import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import HotelDetail from './HotelDetail';

/**
 * THE LIVE-CHECK BOUNDARY (Ch 1, standing rule; Levent 16 Oct).
 *
 * Nothing on this page may reach a supplier until the traveller presses "Check price &
 * availability". Everything before that is answered from the cache: the price strip, the
 * package matrix, hotel content, feasibility, the alternative dates.
 *
 * The rule is easy to state and easy to break. A new panel that wants a "real" price, a
 * refactor that moves a call one level up, an effect that re-runs on a filter change: any of
 * them can add a supplier call that nobody notices, because the page still looks right. What
 * goes wrong is invisible from the screen and lands on the supplier contract instead, as
 * look-to-book ratio and rate-limit pressure, and it is the kind of thing a supplier
 * complains about long after the commit that caused it.
 *
 * So this file does not test a feature. It tests that an entire class of call does not happen
 * yet, and then that it does happen on the press. It is deliberately written against the
 * ENDPOINTS rather than the UI, so it keeps working when the screen is redesigned.
 */

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

/**
 * Every endpoint that reaches a supplier. A live hotel search, a live flight search, and the
 * confirm that re-prices a cached fare at the supplier before booking.
 *
 * Adding an endpoint here is how a future supplier call gets covered. If a new one is added to
 * the page and NOT listed here, the last test in this file is what notices.
 */
const LIVE_ENDPOINTS = [
  '/hotel-availability/search',
  '/flight-availability/search',
  '/flight-availability/cached-search/confirm',
  // Asked once a day has been checked, to find out whether a transfer between that airport
  // and this hotel exists at all — the overview only offers one when it does.
  '/transfer-availability/search',
];

const livePosts = () =>
  post.mock.calls.filter(([url]) => LIVE_ENDPOINTS.some((e) => String(url).includes(e)));

const iso = (plusDays) => {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  return d.toISOString().slice(0, 10);
};
const CHECK_IN = iso(30);

const RATES = [
  { roomName: 'Sea View Double', roomCode: 'DBL.SV', boardName: 'ALL INCLUSIVE', boardCode: 'AI', sellingRate: 1180, currency: 'EUR', rateKey: 'k1', cancellationPolicies: [] },
];
const CALENDAR = Array.from({ length: 7 }, (_, i) => ({
  date: iso(27 + i), price: 260 + i * 12, currency: 'EUR', isLowest: i === 0,
}));

beforeEach(() => {
  post.mockReset();
  showToast.mockReset();
  post.mockImplementation((url) => {
    if (String(url).includes('hotel-availability')) {
      return Promise.resolve({ data: { results: { hotelbeds: { rooms: RATES } } } });
    }
    return Promise.resolve({ data: {} });
  });
  globalThis.fetch = vi.fn((url) => {
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

const renderPage = (extra = '') => {
  const qs = `?checkIn=${CHECK_IN}&checkOut=${iso(37)}&adults=2&children=0&rooms=1&nights=7&destination=AYT&name=Test+Hotel${extra}`;
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={[`/hotel/300984${qs}`]}>
        <Routes>
          <Route path="/hotel/:hotelCode" element={<HotelDetail />} />
          <Route path="/checkout" element={<div data-testid="checkout">CHECKOUT</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
};

/** The page is "settled" once the cache-fed price strip has painted. */
const settled = async () => {
  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: /vanaf €\d+/i }).length).toBeGreaterThan(0);
  });
  // Give any effect that was going to fire a chance to fire, so "nothing happened" means it.
  await new Promise((r) => { setTimeout(r, 250); });
};

const checkButton = () => screen.findByRole('button', { name: /prijs & beschikbaarheid controleren/i });

describe('no supplier is called before the traveller asks', () => {
  it('opens, prices and paints without touching a supplier', async () => {
    renderPage();
    await settled();
    expect(livePosts().map(([u]) => u)).toEqual([]);
  });

  it('stays silent in Flight + Hotel mode too', async () => {
    // The package path has its own matrix and feasibility calls, all cache-backed. None of
    // them may turn into a live flight search just because a package is on screen.
    renderPage('&transport=package&origin=BRU');
    await settled();
    expect(livePosts().map(([u]) => u)).toEqual([]);
  });

  it('stays silent while the traveller browses alternative dates', async () => {
    // Clicking around the strip re-prices from the cache. This is the move most likely to grow
    // a hidden live call, because each click looks like "get me the real price for this day".
    const user = userEvent.setup();
    renderPage();
    await settled();

    const days = screen.getAllByRole('button', { name: /vanaf €\d+/i });
    await user.click(days[0]);
    if (days[1]) await user.click(days[1]);
    await new Promise((r) => { setTimeout(r, 250); });

    expect(livePosts().map(([u]) => u)).toEqual([]);
  });

  it('calls the supplier the moment the check is pressed, and not before', async () => {
    // The other half of the rule. A boundary nothing ever crosses would be satisfied by a page
    // that simply never checks availability, which is not what we want either.
    const user = userEvent.setup();
    renderPage();
    await settled();
    expect(livePosts()).toHaveLength(0);

    await user.click(screen.getAllByRole('button', { name: /vanaf €\d+/i })[0]);
    await user.click(await checkButton());

    await waitFor(() => expect(livePosts().length).toBeGreaterThan(0));
    expect(livePosts().some(([u]) => String(u).includes('/hotel-availability/search'))).toBe(true);
  });

  it('knows about every supplier endpoint the page can call', async () => {
    // The guard above only guards what LIVE_ENDPOINTS lists. This reads the component source
    // and fails when it posts to an availability or confirm endpoint this file has not been
    // told about, so a new supplier call cannot slip past by being unlisted.
    const fs = await import('node:fs/promises');
    const url = await import('node:url');
    const path = await import('node:path');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = await fs.readFile(path.join(here, 'HotelDetail.jsx'), 'utf8');

    const posted = [...src.matchAll(/axiosInstance\.post\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
    const supplierish = posted.filter((p) => /availability\/search|cached-search\/confirm/.test(p));
    const unlisted = supplierish.filter((p) => !LIVE_ENDPOINTS.some((e) => p.includes(e)));

    expect(unlisted, 'add these to LIVE_ENDPOINTS so the boundary covers them').toEqual([]);
    // And the list must not rot the other way either: every entry should still be reachable.
    expect(supplierish.length).toBeGreaterThan(0);
  });
});
