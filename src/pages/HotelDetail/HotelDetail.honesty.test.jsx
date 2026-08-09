import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import HotelDetail from './HotelDetail';

// The detail page must never invent a price, a room, a flight or a discount.
//
// It used to. When the price-calendar call failed — OR the hotel was genuinely full, OR the
// page was opened without dates — the fare strip silently rendered PRICE_DAYS: seven
// hardcoded March 2026 fares with invented "was" prices, drawn with the same bars, the same
// "from €X" and the same gold "Lowest price" flag as real data. An outage and a sold-out
// hotel were indistinguishable from seven bookable days. Those demo entries carried no `iso`,
// so clicking one priced `baseCheckIn` instead: the day you clicked was not the day quoted.
//
// The flight list and the room list did the same. Before any live search they printed two
// hardcoded TUI fly / Transavia itineraries under "We have selected the cheapest flight for
// you", and four invented room types carrying fabricated scarcity ("Only 1 room available!").
// Both fed the checkout hand-off, so a traveller who never ran a check could reach the
// payment summary looking at a flight number and a room that had never been searched.
//
// These tests pin the honest behaviour: live data or a truthful empty state, and no route to
// checkout without a rate the supplier actually quoted.

const post = vi.fn();
const showToast = vi.fn();
vi.mock('../../services/axiosInstance', () => ({
  default: { post: (...a) => post(...a), get: vi.fn(() => Promise.resolve({ data: {} })) },
  // The live-supplier endpoints pass this as a per-request override; a mock without it
  // throws on property access the moment a search runs.
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

const RATES = [
  { roomName: 'Sea View Double', roomCode: 'DBL.SV', boardName: 'ALL INCLUSIVE', boardCode: 'AI', sellingRate: 1180, currency: 'EUR', rateKey: 'k1', cancellationPolicies: [] },
];
// The strip CENTRES the searched day (three days either side, like pickDay), so the priced
// week the mock serves runs from CHECK_IN − 3.
const CALENDAR = Array.from({ length: 7 }, (_, i) => ({
  date: iso(27 + i), price: 260 + i * 12, currency: 'EUR', isLowest: i === 0,
}));

// `calendar` controls what the price service returns: an array, [] for a full hotel, or
// the string 'fail' to reject, or 'http500' to answer with an error status.
let calendarMode = CALENDAR;

beforeEach(() => {
  post.mockReset();
  showToast.mockReset();
  calendarMode = CALENDAR;
  post.mockImplementation((url) => {
    if (String(url).includes('hotel-availability')) {
      return Promise.resolve({ data: { results: { hotelbeds: { rooms: RATES } } } });
    }
    return Promise.resolve({ data: {} });
  });
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('hotel-price-calendar')) {
      if (calendarMode === 'fail') return Promise.reject(new TypeError('Failed to fetch'));
      if (calendarMode === 'http500') return Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({}) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ calendar: calendarMode }) });
    }
    if (u.includes('/hotels/bulk')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{ hotelCode: '300984', name: 'Test Hotel', stars: 4, images: [], facilities: [] }]) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false }, reducers: {} });
const makeStore = () => configureStore({ reducer: { auth: auth.reducer } });

const renderPage = ({ withDates = true } = {}) => {
  const qs = withDates
    ? `?checkIn=${CHECK_IN}&checkOut=${iso(37)}&adults=2&children=0&rooms=1&nights=7&destination=AYT&name=Test+Hotel`
    : '?name=Test+Hotel';
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

const runCheck = async (user) => {
  const days = await waitFor(() => {
    const found = screen.getAllByRole('button', { name: /from €\d+/i });
    expect(found.length).toBeGreaterThan(0);
    return found;
  });
  await user.click(days[0]);
  await user.click(await screen.findByRole('button', { name: /check price & availability/i }));
  await waitFor(() => expect(post).toHaveBeenCalled());
};

describe('a sold-out day disables the check button', () => {
  // The supplier was asked and returned nothing. The button the traveller pressed must stay
  // where it is and go dead — a control that vanishes reads as a glitch — and it must come
  // back the moment they choose a different day in the strip.
  const emptyAvailability = () => post.mockImplementation((url) => (
    String(url).includes('hotel-availability')
      ? Promise.resolve({ data: { results: { hotelbeds: { rooms: [] } } } })
      : Promise.resolve({ data: {} })
  ));

  it('greys the button and renames it "Not Available"', async () => {
    const user = userEvent.setup();
    emptyAvailability();
    renderPage();
    await runCheck(user);

    const btn = await screen.findByRole('button', { name: /^not available$/i });
    expect(btn).toBeDisabled();
    // The live "check" affordance must not still be offered for a day that has nothing.
    expect(screen.queryByRole('button', { name: /check price & availability/i })).not.toBeInTheDocument();
  });

  it('re-enables the button when another day is picked', async () => {
    const user = userEvent.setup();
    emptyAvailability();
    renderPage();
    await runCheck(user);
    await screen.findByRole('button', { name: /^not available$/i });

    // A different day in the matrix is a different question, so the button is live again.
    const days = screen.getAllByRole('button', { name: /from €\d+/i });
    await user.click(days[1]);

    expect(await screen.findByRole('button', { name: /check price & availability/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /^not available$/i })).not.toBeInTheDocument();
  });
});

describe('the fare strip never invents a week', () => {
  it('asks for dates instead of quoting a demo week when the search carries none', async () => {
    renderPage({ withDates: false });
    expect(await screen.findByText(/choose your dates to see live prices/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /from €\d+/i })).not.toBeInTheDocument();
  });

  it('reports an outage as an outage, and offers a retry', async () => {
    calendarMode = 'fail';
    renderPage();
    expect(await screen.findByText(/couldn’t load live prices/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /from €\d+/i })).not.toBeInTheDocument();
  });

  // A 5xx that answers with an HTML error page used to land in .catch() looking exactly like
  // an empty calendar, i.e. "no availability" — the opposite of what happened.
  it('treats an error status as a failure, not as a sold-out hotel', async () => {
    calendarMode = 'http500';
    renderPage();
    expect(await screen.findByText(/couldn’t load live prices/i)).toBeInTheDocument();
    expect(screen.queryByText(/no availability for these dates/i)).not.toBeInTheDocument();
  });

  it('says a full hotel is full, with no retry to offer', async () => {
    calendarMode = [];
    renderPage();
    expect(await screen.findByText(/no availability for these dates/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('renders the live fares it was given', async () => {
    renderPage();
    const days = await waitFor(() => {
      const found = screen.getAllByRole('button', { name: /from €\d+/i });
      expect(found.length).toBe(7);
      return found;
    });
    expect(days[0]).toHaveAccessibleName(/from €260/i);
  });
});

describe('flights and rooms are live-only', () => {
  it('does not claim to have picked a cheapest flight before one is searched', async () => {
    renderPage();
    await screen.findAllByRole('button', { name: /from €\d+/i });
    expect(screen.queryByText(/selected the cheapest flight for you/i)).not.toBeInTheDocument();
    // the demo itineraries' flight numbers must appear nowhere
    expect(screen.queryByText(/TB\s?1742|HV\s?6035/)).not.toBeInTheDocument();
  });

  it('never shows invented scarcity for rooms nobody has searched', async () => {
    renderPage();
    await screen.findAllByRole('button', { name: /from €\d+/i });
    expect(screen.queryByText(/only \d+ (rooms? )?available/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/double room design room/i)).not.toBeInTheDocument();
  });

  it('shows the rooms the supplier really returned once a date is checked', async () => {
    const user = userEvent.setup();
    renderPage();
    await runCheck(user);
    expect(await screen.findByText(/sea view double/i)).toBeInTheDocument();
  });
});

// axios describes its own internals — "timeout of 15000ms exceeded", "Network Error" — and
// those strings were printed verbatim under "Choose your room". A shopper can do nothing with
// a millisecond count; they need to know whether to retry.
describe('supplier failures are reported in words a traveller can use', () => {
  it('translates a timeout instead of printing the axios message', async () => {
    const user = userEvent.setup();
    const timeout = Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ECONNABORTED' });
    post.mockImplementation((url) => (String(url).includes('hotel-availability')
      ? Promise.reject(timeout)
      : Promise.resolve({ data: {} })));

    renderPage();
    await runCheck(user);

    expect(await screen.findByText(/couldn’t load live room prices/i)).toBeInTheDocument();
    expect(screen.queryByText(/timeout of \d+ms exceeded/i)).not.toBeInTheDocument();
    // "Suppliers" is our word, not a traveller's — the message must never name our plumbing.
    expect(screen.queryByText(/supplier/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /try again/i }).length).toBeGreaterThan(0);
  });

  it('offers a retry that re-runs the search', async () => {
    const user = userEvent.setup();
    const timeout = Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ECONNABORTED' });
    let attempt = 0;
    post.mockImplementation((url) => {
      if (!String(url).includes('hotel-availability')) return Promise.resolve({ data: {} });
      attempt += 1;
      return attempt === 1
        ? Promise.reject(timeout)
        : Promise.resolve({ data: { results: { hotelbeds: { rooms: RATES } } } });
    });

    renderPage();
    await runCheck(user);
    await screen.findByText(/couldn’t load live room prices/i);

    const [retry] = screen.getAllByRole('button', { name: /try again/i });
    await user.click(retry);

    expect(await screen.findByText(/sea view double/i)).toBeInTheDocument();
  });
});

describe('checkout is only reachable with a real quote', () => {
  it('sends an unpriced booking to the availability check instead of to payment', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByRole('button', { name: /from €\d+/i });

    // Both the overview card and the sticky sidebar carry the button; either must refuse.
    const [book] = await screen.findAllByRole('button', { name: /check availability/i });
    await user.click(book);

    expect(screen.queryByTestId('checkout')).not.toBeInTheDocument();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/check availability first/i), 'info');
  });

  it('lets a checked booking through to payment', async () => {
    const user = userEvent.setup();
    renderPage();
    await runCheck(user);

    const book = await waitFor(() => screen.getByRole('button', { name: /now book/i }));
    expect(book).toBeEnabled();
    await user.click(book);
    expect(await screen.findByTestId('checkout')).toBeInTheDocument();
  });

  it('quotes no total until the stay has been priced', async () => {
    renderPage();
    await screen.findAllByRole('button', { name: /from €\d+/i });
    // the old card printed a flat "4 × €361 p.p." / "€1,424" for every unpriced hotel
    expect(screen.queryByText(/1,?444|1,?424|€\s?361/)).not.toBeInTheDocument();
    expect(screen.getByText(/not priced yet/i)).toBeInTheDocument();
  });
});
