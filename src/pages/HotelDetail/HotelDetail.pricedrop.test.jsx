import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import HotelDetail from './HotelDetail';

// The strip quotes a CACHED estimate per day; the check then asks the supplier what that day
// really costs. Either answer is stated outright — the estimate stays on screen struck through
// and the difference is named — because a saving nobody was told about is a saving they did not
// get, and an increase discovered at the checkout is worse than one shown here.
//
// THE RULE THIS FILE EXISTS TO GUARD IS BASIS. The strip is priced PER PERSON; the card quotes
// the party TOTAL. Striking one against the other reports a change of exactly the party size.
// Each surface compares against its own basis, and the subtraction is done on the rounded
// figures actually printed, so the arithmetic adds up on screen.
//
// The second rule is colour: amber for a rise, green for a drop, and never red — red on this
// page means a day with no rooms, and a holiday available at a higher price is not an error.

const LIVE_TOTAL = 384;   // 2 adults → €192 p.p.
const RATES = [
  { roomName: 'Double Room Sea View', roomCode: 'DBL.SV', boardName: 'All Inclusive', boardCode: 'AI', sellingRate: LIVE_TOTAL, currency: 'EUR', rateKey: 'k1', cancellationPolicies: [] },
];

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

// The first day is the one every test picks, so its price is the "was" figure under test.
const calendarStartingAt = (firstDayTotal) => Array.from({ length: 7 }, (_, i) => ({
  date: iso(30 + i), price: i === 0 ? firstDayTotal : 600 + i * 9, currency: 'EUR', isLowest: false,
}));

let calendar = calendarStartingAt(430);

beforeEach(() => {
  calendar = calendarStartingAt(430);
  post.mockReset();
  post.mockImplementation((url) => {
    if (String(url).includes('hotel-availability')) {
      return Promise.resolve({ data: { results: { hotelbeds: { rooms: RATES } } } });
    }
    return Promise.resolve({ data: {} });
  });
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('hotel-price-calendar')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ calendar }) });
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

const priced = async (container) => waitFor(() => {
  const el = container.querySelector('.avail-price-val');
  expect(el?.textContent).toContain('€');
  return el;
});

describe('the matrix is priced per person', () => {
  it('divides the cached party total by the party and says so on the bar', async () => {
    renderPage();
    const days = await waitFor(() => {
      const found = screen.getAllByRole('button', { name: /from €\d+/i });
      expect(found.length).toBeGreaterThan(0);
      return found;
    });
    // Day 1 of the mock is a €430 party total for 2 adults → €215 each; day 2 is €609 → €305
    // (304.5, rounded). Whole euros on the strip: a bar is a few characters wide.
    expect(days[0]).toHaveAccessibleName(/from €215 per person/i);
    expect(days[1]).toHaveAccessibleName(/from €305 per person/i);
  });

  it('states the basis above the chart', async () => {
    renderPage();
    await screen.findAllByRole('button', { name: /from €\d+/i });
    expect(screen.getByText(/prices from, per person/i)).toBeInTheDocument();
  });
});

describe('the live price came back LOWER', () => {
  it('keeps the estimate struck through and quotes the live total', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);
    await priced(container);

    expect(container.querySelector('.avail-price-val').textContent).toBe(`€${LIVE_TOTAL}`);
    expect(container.querySelector('.avail-price-old').textContent).toBe('€430');
  });

  it('names the difference in green, and the arithmetic adds up on screen', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);
    await priced(container);

    const move = container.querySelector('.avail-move');
    expect(move).toBeTruthy();
    expect(move.className).toContain('down');
    expect(move.className).not.toContain('up');
    expect(move.textContent).toMatch(/€46 lower than the earlier price/i);
  });

  it('shows one traveller\'s share of the LIVE total, not of the estimate', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);
    await priced(container);

    expect(container.querySelector('.avail-pp').textContent).toContain('192.00');
    expect(container.querySelector('.avail-forpax').textContent).toMatch(/for 2 adults/i);
  });
});

describe('the live price came back HIGHER', () => {
  beforeEach(() => { calendar = calendarStartingAt(346); });   // live 384 is €38 dearer

  it('still quotes the live total, with the estimate struck through', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);
    await priced(container);

    expect(container.querySelector('.avail-price-val').textContent).toBe(`€${LIVE_TOTAL}`);
    expect(container.querySelector('.avail-price-old').textContent).toBe('€346');
  });

  it('reports the rise in AMBER, never red', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);
    await priced(container);

    const move = container.querySelector('.avail-move');
    expect(move.className).toContain('up');
    expect(move.textContent).toMatch(/€38 higher than the earlier price/i);
    // The amber treatment is the `up` modifier; nothing here may borrow the page's
    // unavailable-day styling.
    expect(move.className).not.toMatch(/danger|error|red|unavail/i);
  });

  it('keeps the day green, because the holiday is still available', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);
    await priced(container);

    // fc-ok is the green "rooms really came back" state on the selected column.
    expect(container.querySelector('.fc-col.sel.fc-ok')).toBeTruthy();
    expect(container.querySelector('.fc-col.sel.fc-empty')).toBeNull();
    await screen.findByText(/your holiday is available/i);
  });

  it('flags that the price moved, without calling it a failure', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);
    await priced(container);

    const chip = container.querySelector('.avail-updated');
    expect(chip.textContent).toMatch(/price updated after live check/i);
    expect(chip.className).not.toContain('down');
  });
});

describe('basis is never crossed', () => {
  it('compares per-person against per-person on the strip', async () => {
    // €430 party total → €215 p.p.; live €384 → €192 p.p.; the bar must report €23, the
    // per-person difference, and never €46, which is the difference between the totals.
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);
    await priced(container);

    const tag = await waitFor(() => {
      const el = container.querySelector('.fc-movetag');
      expect(el).toBeTruthy();
      return el;
    });
    expect(tag.textContent).toMatch(/€23 lower/i);
    expect(tag.textContent).not.toMatch(/46/);

    // And the bar itself carries the two per-person figures, not the totals.
    expect(container.querySelector('.fc-was').textContent).toBe('€215');
    expect(container.querySelector('.fc-amt-live').textContent).toBe('€192');
  });

  it('compares total against total on the card', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);
    await priced(container);

    // The card is the party total throughout: €430 → €384, a €46 move.
    expect(container.querySelector('.avail-price-old').textContent).toBe('€430');
    expect(container.querySelector('.avail-move').textContent).toMatch(/€46/);
    expect(container.querySelector('.avail-move').textContent).not.toMatch(/€23/);
  });
});

describe('no invented "was" price', () => {
  it('strikes nothing through when the two prices are the same', async () => {
    calendar = calendarStartingAt(LIVE_TOTAL);
    const user = userEvent.setup();
    const { container } = renderPage();
    await checkFirstDay(user);
    await priced(container);

    expect(container.querySelector('.avail-price-old')).toBeNull();
    expect(container.querySelector('.avail-move')).toBeNull();
    expect(container.querySelector('.fc-movetag')).toBeNull();
  });

  it('strikes nothing through on a day the cache never costed', async () => {
    // price 0 is this page's word for "no estimate" — there is no earlier figure to have
    // moved from, so a difference here would be pure invention.
    calendar = calendarStartingAt(0);
    const user = userEvent.setup();
    const { container } = renderPage();
    const days = await waitFor(() => {
      const found = container.querySelectorAll('.fc-col');
      expect(found.length).toBeGreaterThan(0);
      return found;
    });
    await user.click(days[0]);
    await user.click(await screen.findByRole('button', { name: /check price & availability/i }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    await priced(container);

    expect(container.querySelector('.avail-price-old')).toBeNull();
    expect(container.querySelector('.avail-move')).toBeNull();
  });
});
