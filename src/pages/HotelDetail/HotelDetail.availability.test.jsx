import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import HotelDetail from './HotelDetail';

// ONE RULE, TESTED FROM EVERY SIDE: a failure is never shown as unavailability.
//
// "Not available" is a claim about the world, and this page used to make it from four things
// that are not that claim at all:
//
//   1. A room the supplier returned with no rate. The live list ended
//      `.filter((r) => r.price != null)`, so a hotel that HAS rooms on these dates but quoted
//      no price for them arrived as a hotel with NO rooms — and the page drew that as the red
//      "This trip is not available" card, a dead "Not Available" button and a greyed-out bar.
//      The customer was told their holiday was sold out because our side had no number.
//   2. A supplier that timed out. The availability backend races its suppliers and answers 200
//      with a block per supplier shaped like a real answer whether or not one came:
//      {available:false, rooms:[], error:'Hotelbeds did not respond in time'}. An empty `rooms`
//      array was read as "sold out" either way.
//   3. One supplier saying "none" while another never answered. The one that might have said
//      yes was the one that fell over.
//   4. A flight answer with no fares in it, or with fares carrying no price, reported as
//      "No flights from Brussels for these dates".
//
// The states come from src/utils/availability.js, whose `unavailable()` cannot be built without
// naming the sources that positively answered "none" and whose `fromFailure()` cannot return
// UNAVAILABLE at all. These tests pin the behaviour that safeguard is there to produce.

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
const NIGHTS = 7;

const PRICED_ROOM = {
  roomName: 'Sea View Double', roomCode: 'DBL.SV', boardName: 'ALL INCLUSIVE', boardCode: 'AI',
  sellingRate: 1180, currency: 'EUR', rateKey: 'k1', cancellationPolicies: [],
};
// The same room as the supplier sends it when it holds the inventory but quotes nothing: a real
// room, a real board, no rate. This is case 1 above.
const UNPRICED_ROOM = { ...PRICED_ROOM, sellingRate: null, net: null, price: null, rateKey: null };

// The strip centres the searched day, so the priced week runs from CHECK_IN − 3.
const CALENDAR = Array.from({ length: 7 }, (_, i) => ({
  date: iso(27 + i), price: 260 + i * 12, currency: 'EUR', isLowest: i === 0,
}));

const FLIGHT = {
  totalPrice: 620, currency: 'EUR', flightKeys: ['f1'],
  outbound: { legs: [{ from: 'BRU', to: 'AYT', airline: 'TK', flightNumber: '1', departure: `${CHECK_IN}T09:00:00`, arrival: `${CHECK_IN}T13:30:00`, duration: 270 }] },
  inbound: { legs: [{ from: 'AYT', to: 'BRU', airline: 'TK', flightNumber: '2', departure: `${iso(30 + NIGHTS)}T14:00:00`, arrival: `${iso(30 + NIGHTS)}T18:30:00`, duration: 270 }] },
};

/** Answer the hotel search with `hotel` and the flight search with `flight`. */
const serve = ({ hotel, flight = { data: {} } } = {}) => {
  post.mockImplementation((url) => {
    const u = String(url);
    if (u.includes('hotel-availability')) {
      return typeof hotel === 'function' ? hotel() : Promise.resolve(hotel ?? { data: {} });
    }
    if (u.includes('flight-availability')) {
      return typeof flight === 'function' ? flight() : Promise.resolve(flight);
    }
    return Promise.resolve({ data: {} });
  });
};

beforeEach(() => {
  post.mockReset();
  showToast.mockReset();
  serve({ hotel: { data: { results: { hotelbeds: { rooms: [PRICED_ROOM] } } } } });
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

/** `transport` defaults to hotel_only so the flight block stays out of the room tests. */
const renderPage = ({ transport = 'hotel_only' } = {}) => render(
  <Provider store={makeStore()}>
    <MemoryRouter initialEntries={[
      `/hotel/300984?checkIn=${CHECK_IN}&checkOut=${iso(30 + NIGHTS)}&adults=2&children=0&rooms=1`
      + `&nights=${NIGHTS}&destination=AYT&name=Test+Hotel&transport=${transport}&origin=BRU`,
    ]}>
      <Routes>
        <Route path="/hotel/:hotelCode" element={<HotelDetail />} />
        <Route path="/checkout" element={<div data-testid="checkout">CHECKOUT</div>} />
      </Routes>
    </MemoryRouter>
  </Provider>,
);

/** Pick a day in the fare strip and ask for the live check. */
const runCheck = async (user, dayIndex = 0) => {
  const days = await waitFor(() => {
    const found = screen.getAllByRole('button', { name: /vanaf €\d+/i });
    expect(found.length).toBeGreaterThan(0);
    return found;
  });
  await user.click(days[dayIndex]);
  await user.click(await screen.findByRole('button', { name: /prijs & beschikbaarheid controleren/i }));
  await waitFor(() => expect(post).toHaveBeenCalled());
};

const hotelCalls = () => post.mock.calls.filter((c) => String(c[0]).includes('hotel-availability')).length;
/** The dead CTA that only a CONFIRMED empty answer is allowed to produce. */
const soldOutButton = () => screen.queryByRole('button', { name: /^niet beschikbaar$/i });

describe('rooms the supplier could not price', () => {
  it('asks to check the price instead of saying the hotel is sold out', async () => {
    const user = userEvent.setup();
    serve({ hotel: { data: { results: { hotelbeds: { rooms: [UNPRICED_ROOM] } } } } });
    const { container } = renderPage();
    await runCheck(user);

    // The whole point: rooms exist, so nothing here may read as unavailability.
    await waitFor(() => expect(container.querySelector('.room-section .live-error')).toBeTruthy());
    expect(soldOutButton()).not.toBeInTheDocument();
    expect(screen.queryByText(/deze reis is niet beschikbaar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/geen live kamers gevonden/i)).not.toBeInTheDocument();

    // What it says instead, and the way forward. Scoped to the room block: the card above the
    // strip says the same thing in its own words, so a page-wide query matches several nodes.
    const rooms = within(container.querySelector('.room-section'));
    expect(rooms.getByText(/er kwam geen prijs terug/i)).toBeInTheDocument();
    expect(container.querySelector('.room-section .live-retry')).toBeTruthy();
  });

  it('marks the day as still to be priced rather than confirmed', async () => {
    const user = userEvent.setup();
    serve({ hotel: { data: { results: { hotelbeds: { rooms: [UNPRICED_ROOM] } } } } });
    const { container } = renderPage();
    await runCheck(user);

    await waitFor(() => expect(container.querySelector('.fc-res.failed')).toBeTruthy());
    expect(screen.getByText(/prijs moet nog gecontroleerd worden/i)).toBeInTheDocument();
    // The green "confirmed" badge is a claim about a price nobody quoted.
    expect(screen.queryByText(/live beschikbaarheid en prijs bevestigd/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/je vakantie is beschikbaar/i)).not.toBeInTheDocument();
    // And the day keeps its cache estimate in the strip rather than going grey.
    expect(container.querySelector('.fc-col.fc-empty')).toBeNull();
  });

  it('claims no bookable price, so checkout stays out of reach', async () => {
    const user = userEvent.setup();
    serve({ hotel: { data: { results: { hotelbeds: { rooms: [UNPRICED_ROOM] } } } } });
    renderPage();
    await runCheck(user);

    await waitFor(() => expect(screen.getAllByText(/er kwam geen prijs terug/i).length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: /doorgaan naar afrekenen/i })).not.toBeInTheDocument();
    // A room with no rate must not be sorted to the top of the list as a free one either.
    expect(screen.queryByText(/€\s?0\b/)).not.toBeInTheDocument();
  });

  it('prices the rooms that DO have a rate and ignores the ones that do not', async () => {
    const user = userEvent.setup();
    serve({ hotel: { data: { results: { hotelbeds: { rooms: [UNPRICED_ROOM, PRICED_ROOM] } } } } });
    const { container } = renderPage();
    await runCheck(user);

    // One priced rate is a bookable hotel: the unpriced twin must not drag the state down.
    await waitFor(() => {
      const rooms = [...container.querySelectorAll('.room-section .room-group-name')];
      expect(rooms.some((r) => /sea view double/i.test(r.textContent))).toBe(true);
    });
    expect(screen.getByText(/je vakantie is beschikbaar/i)).toBeInTheDocument();
  });
});

describe('a supplier that could not answer', () => {
  // The backend hands back a block shaped exactly like a real "no rooms" answer when a
  // supplier misses the window. Reading the two alike is how an outage became a sold-out hotel.
  const timedOut = {
    data: { results: { hotelbeds: { available: false, cheapestPrice: null, rooms: [], error: 'Hotelbeds did not respond in time' } } },
  };

  it('is not a sold-out hotel', async () => {
    const user = userEvent.setup();
    serve({ hotel: timedOut });
    const { container } = renderPage();
    await runCheck(user);

    await waitFor(() => expect(container.querySelector('.room-section .live-error')).toBeTruthy());
    expect(soldOutButton()).not.toBeInTheDocument();
    expect(screen.queryByText(/deze reis is niet beschikbaar/i)).not.toBeInTheDocument();
  });

  it('is reported as a timeout, in words, with a retry', async () => {
    const user = userEvent.setup();
    serve({ hotel: timedOut });
    const { container } = renderPage();
    await runCheck(user);

    // The supplier's own sentence names our plumbing and is never shown; the cause survives as
    // a code, and the timeout wording is what the traveller gets.
    expect(await screen.findByText(/live roomprijzen.*niet laden/i)).toBeInTheDocument();
    expect(screen.queryByText(/did not respond in time/i)).not.toBeInTheDocument();
    expect(container.querySelector('.room-section .live-retry')).toBeTruthy();
  });

  it('outranks another supplier that really said "none"', async () => {
    const user = userEvent.setup();
    serve({
      hotel: {
        data: {
          results: {
            // Asked and answered: nothing.
            hotelbeds: { available: false, cheapestPrice: null, rooms: [] },
            // Asked and never answered. This is the one that might have said yes.
            diana: { available: false, cheapestPrice: null, rooms: [], error: 'Diana did not respond in time' },
          },
        },
      },
    });
    const { container } = renderPage();
    await runCheck(user);

    await waitFor(() => expect(container.querySelector('.room-section .live-error')).toBeTruthy());
    expect(soldOutButton()).not.toBeInTheDocument();
  });

  it('is not counted as a voice at all when it was never called', async () => {
    const user = userEvent.setup();
    serve({
      hotel: {
        data: {
          results: {
            hotelbeds: { available: false, cheapestPrice: null, rooms: [] },
            // No mapping for this hotel, so this supplier was never asked. It must neither
            // confirm the negative nor turn it into an outage.
            w2m: { available: false, cheapestPrice: null, rooms: [], notApplicable: true },
          },
        },
      },
    });
    renderPage();
    await runCheck(user);

    // One supplier answered "none" and nothing contradicted it: the honest negative stands.
    expect(await screen.findByRole('button', { name: /^niet beschikbaar$/i })).toBeDisabled();
  });

  it('never re-checks a day a supplier has already confirmed as empty', async () => {
    // pointerEventsCheck off so the clicks below are really attempted: the point is that the
    // page refuses them, not that the test runner does.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    serve({ hotel: { data: { results: { hotelbeds: { rooms: [] } } } } });
    const { container } = renderPage();
    await runCheck(user);

    const dead = await screen.findByRole('button', { name: /^niet beschikbaar$/i });
    expect(dead).toBeDisabled();
    const asked = hotelCalls();
    // Both controls for that day are inert: the CTA it replaced, and the bar itself.
    await user.click(dead);
    const bar = container.querySelector('.fc-col.sel');
    expect(bar).toBeDisabled();
    await user.click(bar);
    expect(hotelCalls()).toBe(asked);
  });
});

describe('while a check is running', () => {
  it('keeps the choices on screen and shows no price from the previous selection', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    serve({
      hotel: () => {
        attempt += 1;
        // The first day answers; the second never does, so the page stays in CHECKING.
        return attempt === 1
          ? Promise.resolve({ data: { results: { hotelbeds: { rooms: [PRICED_ROOM] } } } })
          : new Promise(() => {});
      },
    });
    const { container } = renderPage();
    await runCheck(user, 0);
    // The first day was quoted: €1,180 for the party. The card and the sidebar both say so.
    await waitFor(() => expect(screen.getAllByText(/1,180/).length).toBeGreaterThan(0));

    // A different day is a different question.
    // The strip re-centres on the day that was checked, so only the days it still has cache
    // prices for carry a "from" label. Take the last of those: it is certainly not the one
    // already quoted.
    const days = screen.getAllByRole('button', { name: /vanaf €\d+/i });
    expect(days.length).toBeGreaterThan(1);
    await user.click(days[days.length - 1]);
    await user.click(await screen.findByRole('button', { name: /prijs & beschikbaarheid controleren/i }));

    await screen.findByText(/live beschikbaarheid wordt gecontroleerd/i);
    // The confirmed price belonged to the day they moved off. Carrying it under the new
    // selection would quote a figure nobody has been given for these dates.
    expect(screen.queryAllByText(/1,180/)).toHaveLength(0);
    // And their choices are all still on screen: the day, the party and the stay length.
    expect(container.querySelector('.fc-col.sel')).toBeTruthy();
    expect(screen.getAllByText(/2 volwassenen/i).length).toBeGreaterThan(0);
  });
});

describe('flights nobody could price', () => {
  it('reports a flight supplier outage as an outage, not as a route with no flights', async () => {
    const user = userEvent.setup();
    serve({
      hotel: { data: { results: { hotelbeds: { rooms: [PRICED_ROOM] } } } },
      // Exactly what the backend answers when the flight supplier fails: 200, empty list, error.
      flight: { data: { results: { airtuerk: { available: false, cheapestPrice: null, flights: [], error: 'Airtuerk did not respond in time' } } } },
    });
    const { container } = renderPage({ transport: 'package' });
    await runCheck(user);

    await waitFor(() => expect(container.querySelector('.flight-section .live-error')).toBeTruthy());
    expect(screen.queryByText(/geen vluchten vanaf/i)).not.toBeInTheDocument();
    expect(container.querySelector('.flight-section .live-retry')).toBeTruthy();
  });

  it('says a fare came back without a price rather than "no flights"', async () => {
    const user = userEvent.setup();
    serve({
      hotel: { data: { results: { hotelbeds: { rooms: [PRICED_ROOM] } } } },
      flight: { data: { results: { airtuerk: { flights: [{ ...FLIGHT, totalPrice: null }] } } } },
    });
    renderPage({ transport: 'package' });
    await runCheck(user);

    expect(await screen.findByText(/kwamen terug zonder prijs/i)).toBeInTheDocument();
    expect(screen.queryByText(/geen vluchten vanaf/i)).not.toBeInTheDocument();
  });

  it('still says "no flights" when the supplier really answered with none', async () => {
    const user = userEvent.setup();
    serve({
      hotel: { data: { results: { hotelbeds: { rooms: [PRICED_ROOM] } } } },
      flight: { data: { results: { airtuerk: { available: false, cheapestPrice: null, flights: [] } } } },
    });
    renderPage({ transport: 'package' });
    await runCheck(user);

    expect(await screen.findByText(/geen vluchten vanaf/i)).toBeInTheDocument();
  });

  it('never offers a fare with no price as a free flight', async () => {
    const user = userEvent.setup();
    serve({
      hotel: { data: { results: { hotelbeds: { rooms: [PRICED_ROOM] } } } },
      flight: { data: { results: { airtuerk: { flights: [{ ...FLIGHT, totalPrice: 0 }, FLIGHT] } } } },
    });
    renderPage({ transport: 'package' });
    await runCheck(user);

    // The €0 twin used to sort above the real fare and win the default pick, which put a
    // package on screen for the price of the room alone. The package total is the room (1,180)
    // plus the fare that actually has a price (620), and the flight card itself must be the
    // priced one. The page card deliberately prints no fare of its own, so the total is where
    // this shows: 1,180 would mean the free phantom had been chosen.
    await waitFor(() => expect(screen.getAllByText(/1,800/).length).toBeGreaterThan(0));
  });
});
