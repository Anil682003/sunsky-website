import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import HotelDetail from './HotelDetail';

// The availability card and the room list must name the SAME rate.
//
// They did not. The card opened on index 0 of the flat rate array — the cheapest rate from any
// supplier, before the "Care (meals)" filter — while the list below only ever showed rates that
// survived that filter. A traveller who asked for Bed & Breakfast was quoted an All Inclusive
// price and board they could not see on the page, could not have chosen, and could only undo by
// clicking a room, which then silently changed the price they had already read.
//
// Reported from live: a Bodrum hotel quoted "€1020 · All inclusive" in the card while the list
// showed Bed & Breakfast at €1,200 and clicking it corrected the card.

const AI  = { roomName: 'Standard Land View', roomCode: 'STD.LV',  boardName: 'All Inclusive',   boardCode: 'AI', sellingRate: 1020, currency: 'EUR', rateKey: 'ai',  cancellationPolicies: [] };
const BB  = { roomName: 'Double Garden View', roomCode: 'DBL.GV',  boardName: 'Bed and Breakfast', boardCode: 'BB', sellingRate: 1200, currency: 'EUR', rateKey: 'bb',  cancellationPolicies: [] };
const BB2 = { roomName: 'Double Sea View',    roomCode: 'DBL.SV',  boardName: 'Bed and Breakfast', boardCode: 'BB', sellingRate: 1333, currency: 'EUR', rateKey: 'bb2', cancellationPolicies: [] };

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
    const f = screen.getAllByRole('button', { name: /from €\d+/i });
    expect(f.length).toBeGreaterThan(0);
    return f;
  });
  await user.click(days[0]);
  await user.click(await screen.findByRole('button', { name: /check price & availability/i }));
  await waitFor(() => expect(post).toHaveBeenCalled());
};

/** The board the card claims, off the labelled row in the recap — it sits with the room it
 * belongs to now, under "Accommodation". */
const cardBoard = (container) => [...container.querySelectorAll('.fcu-item')]
  .find((el) => el.querySelector('.fcu-k')?.textContent.trim().toLowerCase() === 'accommodation')
  ?.textContent;

// The card leads with the per-person figure and states the party total under it. These
// tests compare the card against a room row, which is priced for the party, so the total
// is the like-for-like figure to read.
const cardPrice = (container) => {
  const total = container.querySelector('.av-price-total b')?.textContent || '';
  const m = total.match(/€[\d,]+/);
  return m ? m[0].replace(/,/g, '') : undefined;
};

/** The room row the list shows as chosen. */
const selectedRow = (container) => container.querySelector('.room-option.selected');

describe('the card and the room list name the same rate', () => {
  it('opens on the cheapest rate, and the list ticks that same row', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);

    await waitFor(() => expect(cardPrice(container)).toBe('€1020'));
    expect(cardBoard(container)).toMatch(/all inclusive/i);
    await waitFor(() => expect(selectedRow(container)).toBeTruthy());
    expect(selectedRow(container).textContent).toMatch(/all inclusive/i);
    expect(selectedRow(container).textContent).toMatch(/1,?020/);
  });

  it('quotes a rate the meal filter still shows, not a cheaper one it hid', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);
    await waitFor(() => expect(cardPrice(container)).toBe('€1020'));

    // Ask for Bed & Breakfast. That hides the €1020 All Inclusive rate the card is quoting.
    await user.click(screen.getByRole('button', { name: /care \(meals\)/i }));
    await user.click(await screen.findByRole('button', { name: /^bed & breakfast/i }));

    // The card must move to the cheapest rate STILL ON SCREEN. Before this fix it kept
    // quoting €1020 / All inclusive, which the list no longer offered anywhere.
    await waitFor(() => expect(cardPrice(container)).toBe('€1200'));
    expect(cardBoard(container)).toMatch(/bed & breakfast/i);
    expect(cardBoard(container)).not.toMatch(/all inclusive/i);

    const row = selectedRow(container);
    expect(row).toBeTruthy();
    expect(row.textContent).toMatch(/bed & breakfast/i);
    expect(row.textContent).toMatch(/1,?200/);
  });

  it('keeps an explicit pick when it survives the filter', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);

    // Choose the dearer sea-view room by hand.
    const seaView = await waitFor(() => {
      const el = [...container.querySelectorAll('.room-option')].find((n) => /1,?333/.test(n.textContent));
      expect(el).toBeTruthy();
      return el;
    });
    await user.click(seaView);
    await waitFor(() => expect(cardPrice(container)).toBe('€1333'));

    // Filtering to Bed & Breakfast leaves that rate on screen, so the pick stands rather than
    // snapping back to the cheapest.
    await user.click(screen.getByRole('button', { name: /care \(meals\)/i }));
    await user.click(await screen.findByRole('button', { name: /^bed & breakfast/i }));

    await waitFor(() => expect(cardPrice(container)).toBe('€1333'));
    expect(selectedRow(container).textContent).toMatch(/1,?333/);
  });
});
