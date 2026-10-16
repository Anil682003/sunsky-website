import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import HotelDetail from './HotelDetail';

/**
 * UI-04: what a room row costs, measured from the rate the page is quoting.
 *
 * Every row used to be compared with the cheapest rate in its own room, which made every figure
 * a surcharge. A traveller who had moved up to a sea-view room saw no way back down: the cheaper
 * rooms still showed "+€ X p.p." against a baseline they had already left behind. The comparison
 * now moves with the selection, so switching down reads as a saving and says so.
 *
 * The arithmetic itself is covered in roomDelta.test.js. These tests are about what ends up on
 * the row: the sign, the wording of the quoted row, and that both change when the pick does.
 */

const AI  = { roomName: 'Standard Land View', roomCode: 'STD.LV', boardName: 'All Inclusive',    boardCode: 'AI', sellingRate: 1020, currency: 'EUR', rateKey: 'ai',  cancellationPolicies: [] };
const BB  = { roomName: 'Double Garden View', roomCode: 'DBL.GV', boardName: 'Bed and Breakfast', boardCode: 'BB', sellingRate: 1200, currency: 'EUR', rateKey: 'bb',  cancellationPolicies: [] };
const BB2 = { roomName: 'Double Sea View',    roomCode: 'DBL.SV', boardName: 'Bed and Breakfast', boardCode: 'BB', sellingRate: 1333, currency: 'EUR', rateKey: 'bb2', cancellationPolicies: [] };

const post = vi.fn();
vi.mock('../../services/axiosInstance', () => ({ default: { post: (...a) => post(...a), get: vi.fn(() => Promise.resolve({ data: {} })) }, SUPPLIER_TIMEOUT: 25000 }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../api', () => ({ useFavourites: () => ({ data: [], loading: false }), addFavourite: vi.fn(), removeFavourite: vi.fn() }));

const iso = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const CHECK_IN = iso(30), NIGHTS = 7, RETURN_ON = iso(30 + NIGHTS);
const CALENDAR = Array.from({ length: 7 }, (_, i) => ({ date: iso(30 + i), price: 1300 + i * 9, currency: 'EUR', isLowest: false }));

beforeEach(() => {
  post.mockReset();
  post.mockImplementation((url) => (String(url).includes('hotel-availability')
    ? Promise.resolve({ data: { results: { hotelbeds: { rooms: [AI, BB, BB2] } } } })
    : Promise.resolve({ data: {} })));
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('hotel-price-calendar')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ calendar: CALENDAR }) });
    if (u.includes('/hotels/bulk')) return Promise.resolve({ ok: true, json: () => Promise.resolve([{ hotelCode: '165406', name: 'Test Hotel', stars: 5, images: [], facilities: [] }]) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false }, reducers: {} });
const renderPage = () => render(
  <Provider store={configureStore({ reducer: { auth: auth.reducer } })}>
    <MemoryRouter initialEntries={[`/hotel/165406?checkIn=${CHECK_IN}&checkOut=${RETURN_ON}&adults=2&children=0&rooms=1&nights=${NIGHTS}&destination=BJV&name=Test+Hotel&origin=BRU`]}>
      <Routes><Route path="/hotel/:hotelCode" element={<HotelDetail />} /></Routes>
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

/** The row for one room, found by its group heading. */
const rowFor = (container, name) => [...container.querySelectorAll('.room-group')]
  .find((g) => new RegExp(name, 'i').test(g.querySelector('.room-group-name')?.textContent || ''))
  ?.querySelector('.room-option');

/** What the row's right-hand column says. */
const cta = (row) => row?.querySelector('.room-cta')?.textContent?.trim() || '';

describe('room differences are measured from the rate being quoted', () => {
  it('before any pick, the quoted room says it is included and the others their surcharge', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);

    await waitFor(() => expect(rowFor(container, 'land view')).toBeTruthy());

    // Nothing has been selected BY the traveller yet, so the cheapest rate — the one the price
    // above already reflects — is "included", not "selected".
    //
    // Asserted in Dutch on purpose. These strings live in common.json while this page's `t` is
    // bound to the hotelDetail namespace, so without the `common:` prefix they fall back to the
    // English default and still render — just in the wrong language. Matching /included/ too
    // would have let that through.
    expect(cta(rowFor(container, 'land view'))).toMatch(/inbegrepen/i);

    // €1200 − €1020 = €180 over two travellers.
    expect(cta(rowFor(container, 'garden view'))).toMatch(/\+\s*€?\s*90/);
    // €1333 − €1020 = €313 over two, rounded up from €156.50.
    expect(cta(rowFor(container, 'sea view'))).toMatch(/\+\s*€?\s*157/);
  });

  it('picking a dearer room turns the cheaper ones into savings', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);

    const seaView = await waitFor(() => {
      const el = rowFor(container, 'sea view');
      expect(el).toBeTruthy();
      return el;
    });
    await user.click(seaView);

    // The pick is now the baseline and says so, with no figure of its own: the price it implies
    // is already shown above the list.
    await waitFor(() => expect(cta(rowFor(container, 'sea view'))).toMatch(/geselecteerd/i));
    expect(cta(rowFor(container, 'sea view'))).not.toMatch(/\d/);

    // This is the case the old code could not express at all. Both are now money back:
    // €1020 − €1333 = −€313 over two → €157; €1200 − €1333 = −€133 over two → €67 rounded up.
    expect(cta(rowFor(container, 'land view'))).toMatch(/[-−]\s*€?\s*157/);
    expect(cta(rowFor(container, 'garden view'))).toMatch(/[-−]\s*€?\s*67/);
  });

  it('a saving is marked as one, not just signed', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);

    const seaView = await waitFor(() => {
      const el = rowFor(container, 'sea view');
      expect(el).toBeTruthy();
      return el;
    });
    await user.click(seaView);

    // A minus sign at this size is easy to miss, so the cheaper rows carry their own class.
    await waitFor(() => {
      expect(rowFor(container, 'land view').querySelector('.room-delta-pill.cheaper')).toBeTruthy();
    });
    expect(rowFor(container, 'garden view').querySelector('.room-delta-pill.cheaper')).toBeTruthy();
  });

  it('moving the pick back down re-signs every row again', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);

    await waitFor(() => expect(rowFor(container, 'sea view')).toBeTruthy());
    await user.click(rowFor(container, 'sea view'));
    await waitFor(() => expect(cta(rowFor(container, 'land view'))).toMatch(/[-−]/));

    // Back to the cheapest: the rows above it must become surcharges again rather than keeping
    // the sign from the previous baseline.
    await user.click(rowFor(container, 'land view'));
    await waitFor(() => expect(cta(rowFor(container, 'land view'))).toMatch(/geselecteerd/i));
    expect(cta(rowFor(container, 'sea view'))).toMatch(/\+\s*€?\s*157/);
    expect(cta(rowFor(container, 'garden view'))).toMatch(/\+\s*€?\s*90/);
    expect(rowFor(container, 'sea view').querySelector('.room-delta-pill.cheaper')).toBeNull();
  });
});
