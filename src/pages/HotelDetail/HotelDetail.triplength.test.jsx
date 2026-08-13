import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import HotelDetail from './HotelDetail';

// TWO RULES ABOUT WHAT A ROOM ROW AND A FARE BAR MAY SAY.
//
// 1. TRIP LENGTH IS PRINTED IN DAYS, THE UNIT THE TRAVELLER SEARCHED IN.
//    The page counts a stay in NIGHTS, but every filter and heading on the site is worded in
//    DAYS — "7 days" is a 6-night stay (see utils/durations.js). The fare strip, the availability
//    card and the price basis printed the raw nights count under the word "days", so a search for
//    "7 days" came back reading "6 days" on every one of them while the dates beside them still
//    spanned Fri 11 → Thu 17. Reported from live on a Brussels → Antalya week.
//
// 2. A ROOM ROW NEVER QUOTES A CANCELLATION FIGURE.
//    "Cancel now costs €1,354" sat next to the board on rates whose free window had closed. It
//    is a number off a live supplier rate on a row whose job is to sell the room, it moves with
//    the date and the party, and it reads as a charge the traveller is about to incur. Whether a
//    rate is refundable AT ALL is a property of the rate and still stated; what cancelling would
//    cost is not shown here.

const iso = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };

// 6 nights = a "7 days" holiday. This is the whole point of the file: every number asserted
// below is 7, and not one of them is NIGHTS.
const NIGHTS = 6;
const CHECK_IN = iso(30);
const RETURN_ON = iso(30 + NIGHTS);
const DAYS_LABEL = '7 days';

// A rate whose free-cancellation window has already closed but whose penalty is well under the
// rate — cancellationState() calls that 'partial', the one case that used to print the figure.
const PENALTY_RATE = {
  roomName: 'Superior Suite, Sea View', roomCode: 'SUP.SV',
  boardName: 'All Inclusive', boardCode: 'AI',
  sellingRate: 8651, currency: 'EUR', rateKey: 'pen',
  cancellationPolicies: [{ amount: '1354', from: `${iso(-3)}T00:00:00+02:00` }],
};

const post = vi.fn();
vi.mock('../../services/axiosInstance', () => ({ default: { post: (...a) => post(...a), get: vi.fn(() => Promise.resolve({ data: {} })) }, SUPPLIER_TIMEOUT: 25000 }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../api', () => ({ useFavourites: () => ({ data: [], loading: false }), addFavourite: vi.fn(), removeFavourite: vi.fn() }));

const CALENDAR = Array.from({ length: 7 }, (_, i) => ({ date: iso(30 + i), price: 8000 + i * 50, currency: 'EUR', isLowest: false }));

beforeEach(() => {
  post.mockReset();
  post.mockImplementation((url) => (String(url).includes('hotel-availability')
    ? Promise.resolve({ data: { results: { hotelbeds: { rooms: [PENALTY_RATE] } } } })
    : Promise.resolve({ data: {} })));
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('hotel-price-calendar')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ calendar: CALENDAR }) });
    if (u.includes('/hotels/bulk')) return Promise.resolve({ ok: true, json: () => Promise.resolve([{ hotelCode: '1677', name: 'Test Hotel', stars: 5, images: [], facilities: [] }]) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false }, reducers: {} });
const renderPage = () => render(
  <Provider store={configureStore({ reducer: { auth: auth.reducer } })}>
    <MemoryRouter initialEntries={[`/hotel/1677?checkIn=${CHECK_IN}&checkOut=${RETURN_ON}&adults=2&children=0&rooms=1&nights=${NIGHTS}&destination=AYT&name=Test+Hotel&origin=BRU`]}>
      <Routes><Route path="/hotel/:hotelCode" element={<HotelDetail />} /></Routes>
    </MemoryRouter>
  </Provider>
);

const stripDays = async () => waitFor(() => {
  const bars = screen.getAllByRole('button', { name: /from €\d+/i });
  expect(bars.length).toBeGreaterThan(0);
  return bars;
});

const checkFirstDay = async (user) => {
  const days = await stripDays();
  await user.click(days[0]);
  await user.click(await screen.findByRole('button', { name: /check price & availability/i }));
  await waitFor(() => expect(post).toHaveBeenCalled());
};

describe('trip length is stated in days, never in nights', () => {
  it('labels every bar on the fare strip with the searched day count', async () => {
    const { container } = renderPage();
    await stripDays();

    const labels = [...container.querySelectorAll('.fc-nts')].map((el) => el.textContent.trim());
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label).toBe(DAYS_LABEL);
  });

  it('says the same thing to a screen reader as it prints on the bar', async () => {
    renderPage();
    const bars = await stripDays();
    expect(bars[0]).toHaveAccessibleName(new RegExp(DAYS_LABEL, 'i'));
    expect(bars[0]).not.toHaveAccessibleName(new RegExp(`${NIGHTS} (day|night)`, 'i'));
  });

  it('carries the day count onto the line beside the check button', async () => {
    const { container } = renderPage();
    const days = await stripDays();
    const user = userEvent.setup();
    await user.click(days[0]);

    await waitFor(() => expect(container.querySelector('.fc-act-meta')?.textContent).toContain(DAYS_LABEL));
  });

  it('keeps it in days on the availability card and the price basis', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);

    await waitFor(() => expect(container.querySelector('.avail-sub')?.textContent).toContain(DAYS_LABEL));
    await waitFor(() => expect(container.querySelector('.avail-you-low')?.textContent).toContain(DAYS_LABEL));
  });

  it('never prints the nights figure under the word "days" anywhere on the page', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);
    await waitFor(() => expect(container.querySelector('.avail-sub')).toBeTruthy());

    expect(container.textContent).not.toMatch(new RegExp(`\\b${NIGHTS} days\\b`));
  });
});

describe('a room row never quotes what cancelling would cost', () => {
  it('drops the "Cancel now costs" chip from a rate whose free window has closed', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);

    await waitFor(() => expect(container.querySelector('.room-option')).toBeTruthy());
    expect(container.textContent).not.toMatch(/cancel now costs/i);
    expect(container.textContent).not.toMatch(/1,354/);
  });

  it('still says outright when a rate cannot be cancelled at all', async () => {
    post.mockImplementation((url) => (String(url).includes('hotel-availability')
      ? Promise.resolve({
        data: { results: { hotelbeds: { rooms: [{ ...PENALTY_RATE, rateKey: 'nr', cancellationPolicies: [{ amount: '8651', from: `${iso(-3)}T00:00:00+02:00` }] }] } } },
      })
      : Promise.resolve({ data: {} })));

    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);

    await waitFor(() => expect(container.querySelector('.room-option')).toBeTruthy());
    expect(container.querySelector('.room-option').textContent).toMatch(/non-refundable/i);
  });
});
