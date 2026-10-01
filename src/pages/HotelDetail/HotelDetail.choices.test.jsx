import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import HotelDetail from './HotelDetail';

// WHAT THE TRAVELLER CHOSE STAYS CHOSEN, AND WHAT NOBODY PRICED IS NEVER BOOKABLE.
//
// Spec 2.1, 2.7, 3.6 and 3.10, from the side of the traveller's own choices:
//
//   - A flight they picked in the list is theirs. A filter that excludes it, or a fresh answer
//     that no longer has it, leaves it on screen as their choice, says so, and makes them choose
//     again. It is never swapped for another flight behind their back. The page's OWN default is
//     a different thing and simply follows the filters.
//   - A room the supplier returned without a rate is listed as "Check price": there, but not an
//     offer. Never selectable, never the cheapest, never a number.
//   - A failed check claims no bookable price, and a confirmed "no" is never checked again.
//   - The airports asked about and offered are the dashboard's active list, not the seed.

const post = vi.fn();
const get = vi.fn();
const showToast = vi.fn();
vi.mock('../../services/axiosInstance', () => ({
  default: { post: (...a) => post(...a), get: (...a) => get(...a) },
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
const RETURN_ON = iso(30 + NIGHTS);

// The strip centres the searched day, so the priced week runs from CHECK_IN − 3.
const CALENDAR = Array.from({ length: 7 }, (_, i) => ({
  date: iso(27 + i), price: 260 + i * 12, currency: 'EUR', isLowest: i === 0,
}));

// The dashboard's master list of departure airports. Charleroi is NOT on it: the team switched
// it off, and the seed still lists it as a popular airport.
const MASTER = [
  { code: 'BRU', name: 'Brussels Airport', city: 'Brussels', popular: true, sortOrder: 1 },
  { code: 'AMS', name: 'Amsterdam Schiphol', city: 'Amsterdam', popular: true, sortOrder: 2 },
  { code: 'EIN', name: 'Eindhoven', city: 'Eindhoven', popular: true, sortOrder: 3 },
  { code: 'OST', name: 'Ostend-Bruges', city: 'Ostend', popular: false, sortOrder: 4 },
];

const PRICED_ROOM = {
  roomName: 'Sea View Double', roomCode: 'DBL.SV', boardName: 'ALL INCLUSIVE', boardCode: 'AI',
  sellingRate: 1180, currency: 'EUR', rateKey: 'k1', cancellationPolicies: [],
};
// A different room, held by the supplier but quoted without a rate.
const UNPRICED_ROOM = {
  roomName: 'Garden Suite', roomCode: 'STE.GV', boardName: 'HALF BOARD', boardCode: 'HB',
  sellingRate: null, net: null, price: null, rateKey: null, cancellationPolicies: [],
};

const leg = (o) => ({
  from: 'BRU', to: 'AYT', airline: 'XQ', flightNumber: '1653',
  departure: `${CHECK_IN}T17:40:00`, arrival: `${CHECK_IN}T22:00:00`, duration: 260, ...o,
});
const RET = leg({ from: 'AYT', to: 'BRU', flightNumber: '1652', departure: `${RETURN_ON}T11:25:00`, arrival: `${RETURN_ON}T14:05:00` });
const BAGS = { checkedKg: 20, checkedPieces: 0, handKg: 0 };
// The cheapest fare, direct: the page's own default.
const DIRECT = { totalPrice: 1112, currency: 'EUR', flightKeys: ['d'], outbound: { legs: [leg({})] }, inbound: { legs: [RET] }, baggage: BAGS };
// Dearer, one stop via Istanbul: the one the traveller picks by hand.
const VIA_IST = {
  totalPrice: 1240, currency: 'EUR', flightKeys: ['s'],
  outbound: { legs: [
    leg({ to: 'IST', airline: 'TK', flightNumber: '1940', departure: `${CHECK_IN}T09:00:00`, arrival: `${CHECK_IN}T13:00:00` }),
    leg({ from: 'IST', airline: 'TK', flightNumber: '2312', departure: `${CHECK_IN}T15:00:00`, arrival: `${CHECK_IN}T16:10:00` }),
  ] },
  inbound: { legs: [RET] }, baggage: BAGS,
};
// A new, cheaper direct that turns up in a later answer.
const NEW_DIRECT = { ...DIRECT, totalPrice: 1050, flightKeys: ['n'], outbound: { legs: [leg({ flightNumber: '1655', departure: `${CHECK_IN}T06:15:00`, arrival: `${CHECK_IN}T10:35:00` })] } };

const flightAnswer = (flights) => ({ data: { results: { airtuerk: { available: flights.length > 0, flights } } } });
const flightOutage = () => ({ data: { results: { airtuerk: { available: false, cheapestPrice: null, flights: [], error: 'Airtuerk did not respond in time' } } } });
const hotelAnswer = (rooms) => ({ data: { results: { hotelbeds: { rooms } } } });
const timeout = () => Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ECONNABORTED' });

/** Answer the hotel and flight searches. Either may be a function (called per request). */
let hotelReply;
let flightReply;
beforeEach(() => {
  post.mockReset();
  get.mockReset();
  showToast.mockReset();
  hotelReply = () => Promise.resolve(hotelAnswer([PRICED_ROOM]));
  flightReply = () => Promise.resolve(flightAnswer([DIRECT, VIA_IST]));
  post.mockImplementation((url, body) => {
    const u = String(url);
    if (u.includes('hotel-availability')) return hotelReply(body);
    if (u.includes('flight-availability')) return flightReply(body);
    return Promise.resolve({ data: {} });
  });
  get.mockImplementation((url) => (String(url).includes('departure-airports')
    ? Promise.resolve({ data: { airports: MASTER } })
    : Promise.resolve({ data: {} })));
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
afterEach(() => { vi.restoreAllMocks(); });

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false }, reducers: {} });
const makeStore = () => configureStore({ reducer: { auth: auth.reducer } });

const renderPage = ({ transport = 'package' } = {}) => render(
  <Provider store={makeStore()}>
    <MemoryRouter initialEntries={[
      `/hotel/300984?checkIn=${CHECK_IN}&checkOut=${RETURN_ON}&adults=2&children=0&rooms=1`
      + `&nights=${NIGHTS}&destination=AYT&name=Test+Hotel&transport=${transport}&origin=BRU`,
    ]}>
      <Routes>
        <Route path="/hotel/:hotelCode" element={<HotelDetail />} />
        <Route path="/checkout" element={<div data-testid="checkout">CHECKOUT</div>} />
      </Routes>
    </MemoryRouter>
  </Provider>,
);

/** Pick the first priced day in the strip and run the live check. */
const runCheck = async (user) => {
  const days = await waitFor(() => {
    const found = screen.getAllByRole('button', { name: /vanaf €\d+/i });
    expect(found.length).toBeGreaterThan(0);
    return found;
  });
  await user.click(days[0]);
  await user.click(await screen.findByRole('button', { name: /prijs & beschikbaarheid controleren/i }));
  await waitFor(() => expect(post).toHaveBeenCalled());
};

/** Brussels answers with `answers` in turn (the last one repeats); every other airport the page
 *  probes has nothing, and never uses up one of Brussels' answers. */
const brusselsAnswers = (...answers) => {
  const state = { asked: 0 };
  flightReply = (body) => {
    if (body?.from !== 'BRU') return Promise.resolve(flightAnswer([]));
    state.asked += 1;
    return Promise.resolve(answers[Math.min(state.asked, answers.length) - 1]);
  };
  return state;
};

/** Move the clock past the page's five-minute flight cache, so the next search really asks. */
const skipPastFlightCache = () => {
  const realNow = Date.now;
  vi.spyOn(Date, 'now').mockImplementation(() => realNow.call(Date) + 6 * 60 * 1000);
};

const hotelCalls = () => post.mock.calls.filter((c) => String(c[0]).includes('hotel-availability')).length;
const flightFroms = () => post.mock.calls.filter((c) => String(c[0]).includes('flight-availability')).map((c) => c[1]?.from);
const pageCard = (c) => c.querySelector('.flight-section .flight-card.bannered');
const modalCards = (c) => [...c.querySelectorAll('.modal-flights .flight-card')];
const bookButton = (c) => c.querySelector('.overview-book-btn');

const openFlightList = async (user) => {
  await user.click(await screen.findByRole('button', { name: /kies een andere vlucht/i }));
};
const closeFlightList = async (user, c) => { await user.click(c.querySelector('.modal-head .modal-close')); };
/** Take the Istanbul flight by hand, from the change-flight list. */
const pickViaIstanbul = async (user, c) => {
  await openFlightList(user);
  const card = await waitFor(() => {
    const found = modalCards(c).find((el) => el.textContent.includes('TK 1940'));
    expect(found).toBeTruthy();
    return found;
  });
  await user.click(card.querySelector('.fc-pick'));
  await waitFor(() => expect(pageCard(c)?.textContent).toContain('TK 1940'));
};

describe('a flight the traveller picked is never swapped for another', () => {
  it('stays on the card when a filter excludes it, says so, and waits for a new choice', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(pageCard(container)?.textContent).toContain('XQ 1653'));
    await pickViaIstanbul(user, container);

    // Now narrow the list to direct flights, which the chosen one is not.
    await openFlightList(user);
    await user.click(await screen.findByRole('checkbox', { name: /rechtstreekse vluchten/i }));
    // Said where the choosing happens...
    await waitFor(() => expect(container.querySelector('.modal-flights').textContent).toMatch(/past niet meer bij je filters/i));
    await closeFlightList(user, container);

    // ...and on the page: still THEIR flight, with the notice inside the card. Not the direct.
    const card = pageCard(container);
    expect(card.textContent).toContain('TK 1940');
    expect(card.textContent).not.toContain('XQ 1653');
    expect(card.querySelector('.fc-banner-pill').textContent).toMatch(/jouw keuze/i);
    expect(card.querySelector('.flight-warning').textContent).toMatch(/past niet meer bij je filters/i);

    // No booking with a flight that no longer matches: the way on is to choose.
    expect(screen.queryByRole('button', { name: /doorgaan naar afrekenen/i })).not.toBeInTheDocument();
    expect(bookButton(container).textContent).toMatch(/kies een vlucht/i);
    await user.click(bookButton(container));
    expect(screen.queryByTestId('checkout')).not.toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('.modal-overlay.show')).toBeTruthy());

    // Clearing the filters is the other way on, and the choice is still theirs afterwards.
    await user.click(screen.getByRole('button', { name: /alle filters resetten/i }));
    await closeFlightList(user, container);
    await waitFor(() => expect(pageCard(container).querySelector('.flight-warning')).toBeNull());
    expect(pageCard(container).textContent).toContain('TK 1940');
    expect(await screen.findByRole('button', { name: /doorgaan naar afrekenen/i })).toBeEnabled();
  });

  it('lets the page\'s own default follow the filters', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(pageCard(container)?.textContent).toContain('XQ 1653'));

    // Nobody picked anything, so ticking "with a stop" moves the default onto a flight with one.
    await openFlightList(user);
    await user.click(await screen.findByRole('checkbox', { name: /vluchten met tussenstop/i }));
    await closeFlightList(user, container);

    await waitFor(() => expect(pageCard(container).textContent).toContain('TK 1940'));
    expect(pageCard(container).querySelector('.fc-banner-sub').textContent).toMatch(/automatisch gekozen/i);
    expect(pageCard(container).querySelector('.flight-warning')).toBeNull();
    expect(await screen.findByRole('button', { name: /doorgaan naar afrekenen/i })).toBeEnabled();
  });

  it('is found again by what it is when the list is fetched again, wherever it now sits', async () => {
    const user = userEvent.setup();
    // The first room check times out, so there is a retry to press; it re-runs both searches.
    let hotelAttempt = 0;
    hotelReply = () => { hotelAttempt += 1; return hotelAttempt === 1 ? Promise.reject(timeout()) : Promise.resolve(hotelAnswer([PRICED_ROOM])); };
    // The second answer carries a new, cheaper direct: the chosen flight moves down the list,
    // and the page's default would now be that new one.
    const brussels = brusselsAnswers(flightAnswer([DIRECT, VIA_IST]), flightAnswer([NEW_DIRECT, DIRECT, VIA_IST]));

    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(container.querySelector('.room-section .live-retry')).toBeTruthy());
    await pickViaIstanbul(user, container);

    // Past the five-minute flight cache, so the retry really asks again.
    skipPastFlightCache();
    await user.click(container.querySelector('.room-section .live-retry'));

    await waitFor(() => expect(brussels.asked).toBe(2));
    await waitFor(() => expect(pageCard(container)?.textContent).toContain('TK 1940'));
    expect(pageCard(container).textContent).not.toContain('XQ 1655');
    expect(pageCard(container).querySelector('.fc-banner-pill').textContent).toMatch(/jouw keuze/i);
    expect(pageCard(container).querySelector('.flight-warning')).toBeNull();
  });

  it('stays visible with a notice when a fresh answer no longer has it, and is not replaced', async () => {
    const user = userEvent.setup();
    let hotelAttempt = 0;
    hotelReply = () => { hotelAttempt += 1; return hotelAttempt === 1 ? Promise.reject(timeout()) : Promise.resolve(hotelAnswer([PRICED_ROOM])); };
    const brussels = brusselsAnswers(flightAnswer([DIRECT, VIA_IST]), flightAnswer([DIRECT]));

    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(container.querySelector('.room-section .live-retry')).toBeTruthy());
    await pickViaIstanbul(user, container);

    skipPastFlightCache();
    await user.click(container.querySelector('.room-section .live-retry'));

    await waitFor(() => expect(brussels.asked).toBe(2));
    await waitFor(() => expect(pageCard(container)?.querySelector('.flight-warning')?.textContent)
      .toMatch(/gekozen vluchtoptie is niet meer beschikbaar/i));
    // Their flight, not the one left over.
    expect(pageCard(container).textContent).toContain('TK 1940');
    expect(pageCard(container).textContent).not.toContain('XQ 1653');
    expect(screen.queryByRole('button', { name: /doorgaan naar afrekenen/i })).not.toBeInTheDocument();
    expect(bookButton(container).textContent).toMatch(/kies een vlucht/i);
  });

  it('stays visible while a check of it fails, and nothing is bookable until the retry', async () => {
    const user = userEvent.setup();
    let hotelAttempt = 0;
    hotelReply = () => { hotelAttempt += 1; return hotelAttempt === 1 ? Promise.reject(timeout()) : Promise.resolve(hotelAnswer([PRICED_ROOM])); };
    const brussels = brusselsAnswers(flightAnswer([DIRECT, VIA_IST]), flightOutage());

    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(container.querySelector('.room-section .live-retry')).toBeTruthy());
    await pickViaIstanbul(user, container);

    skipPastFlightCache();
    await user.click(container.querySelector('.room-section .live-retry'));

    await waitFor(() => expect(brussels.asked).toBe(2));
    await waitFor(() => expect(container.querySelector('.flight-section .live-error')).toBeTruthy());
    expect(pageCard(container).textContent).toContain('TK 1940');
    expect(container.querySelector('.flight-section .live-retry')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /doorgaan naar afrekenen/i })).not.toBeInTheDocument();
  });
});

describe('a room that came back without a rate', () => {
  it('is listed as "Check price", and is neither selectable nor the cheapest', async () => {
    const user = userEvent.setup();
    hotelReply = () => Promise.resolve(hotelAnswer([PRICED_ROOM, UNPRICED_ROOM]));
    const { container } = renderPage({ transport: 'hotel_only' });
    await runCheck(user);

    const suite = await waitFor(() => {
      const found = [...container.querySelectorAll('.room-section .room-group')]
        .find((g) => /garden suite/i.test(g.querySelector('.room-group-name')?.textContent || ''));
      expect(found).toBeTruthy();
      return found;
    });
    const row = suite.querySelector('.room-option');
    expect(row.textContent).toMatch(/prijs controleren/i);
    expect(row.getAttribute('aria-disabled')).toBe('true');
    // Not the cheapest room in the hotel, and not "per person" priced either.
    expect(suite.querySelector('.room-best-note')).toBeNull();
    expect(suite.querySelector('.room-group-foot')).toBeNull();

    // Clicking it changes nothing: the card still quotes the priced room.
    await user.click(row);
    expect(container.querySelector('.av-price-total').textContent).toContain('€1,180');
    expect(container.querySelector('.room-option.selected').textContent).not.toMatch(/prijs controleren/i);
    expect(screen.queryByText(/€\s?0\b/)).not.toBeInTheDocument();
  });

  it('keeps every room on the list when none came back with a rate, and nothing is sold out', async () => {
    const user = userEvent.setup();
    hotelReply = () => Promise.resolve(hotelAnswer([
      UNPRICED_ROOM,
      { ...UNPRICED_ROOM, roomName: 'Family Room', roomCode: 'FAM.ST', boardName: 'ALL INCLUSIVE', boardCode: 'AI' },
    ]));
    const { container } = renderPage({ transport: 'hotel_only' });
    await runCheck(user);

    await waitFor(() => expect(container.querySelectorAll('.room-section .room-group')).toHaveLength(2));
    // The amber "no price came back" row and its retry, with the rooms under it.
    expect(container.querySelector('.room-section .live-error')).toBeTruthy();
    expect(container.querySelector('.room-section .live-retry')).toBeTruthy();
    const rows = [...container.querySelectorAll('.room-section .room-option')];
    expect(rows).toHaveLength(2);
    rows.forEach((r) => expect(r.textContent).toMatch(/prijs controleren/i));
    expect(container.querySelector('.room-section .room-option.selected')).toBeNull();
    expect(screen.queryByRole('button', { name: /^niet beschikbaar$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/deze reis is niet beschikbaar/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /doorgaan naar afrekenen/i })).not.toBeInTheDocument();
  });
});

describe('a check that failed claims no bookable price', () => {
  it('does not sell the room alone when the flight check of a package failed', async () => {
    const user = userEvent.setup();
    flightReply = () => Promise.resolve(flightOutage());
    const { container } = renderPage();
    await runCheck(user);

    await waitFor(() => expect(container.querySelector('.flight-section .live-error')).toBeTruthy());
    expect(container.querySelector('.flight-section .live-retry')).toBeTruthy();
    // The room was priced, but a package without its flight is not a price anyone may book.
    expect(screen.queryByRole('button', { name: /doorgaan naar afrekenen/i })).not.toBeInTheDocument();
    await user.click(bookButton(container));
    expect(screen.queryByTestId('checkout')).not.toBeInTheDocument();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/niet laden/i), 'error');
  });

  it('never checks again a length of stay a supplier confirmed as empty', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    hotelReply = () => Promise.resolve(hotelAnswer([]));
    const { container } = renderPage({ transport: 'hotel_only' });
    await runCheck(user);
    expect(await screen.findByRole('button', { name: /^niet beschikbaar$/i })).toBeDisabled();
    const asked = hotelCalls();

    // Another length of stay on the same day is another question, and may be asked...
    await user.click(screen.getByRole('button', { name: /^10 dagen$/i }));
    expect(await screen.findByRole('button', { name: /prijs & beschikbaarheid controleren/i })).toBeEnabled();

    // ...but going back to the one already answered brings the answer back, not a new check.
    await user.click(screen.getByRole('button', { name: /^8 dagen$/i }));
    expect(await screen.findByRole('button', { name: /^niet beschikbaar$/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /prijs & beschikbaarheid controleren/i })).not.toBeInTheDocument();
    expect(hotelCalls()).toBe(asked);
    expect(container.querySelector('.fc-col.sel')).toBeDisabled();
  });

  it('reads a price calendar that answered without a calendar as an outage, not a full hotel', async () => {
    globalThis.fetch = vi.fn((url) => (String(url).includes('hotel-price-calendar')
      ? Promise.resolve({ ok: true, json: () => Promise.resolve({ error: 'upstream' }) })
      : Promise.resolve({ ok: true, json: () => Promise.resolve({}) })));
    renderPage({ transport: 'hotel_only' });

    expect(await screen.findByText(/we konden geen live prijzen laden/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /opnieuw proberen/i })).toBeInTheDocument();
    expect(screen.queryByText(/geen beschikbaarheid voor deze data/i)).not.toBeInTheDocument();
  });
});

describe('the other airports', () => {
  // Brussels has none; Amsterdam's probe hits a supplier outage; Eindhoven really has none.
  const byAirport = (body) => {
    if (body?.from === 'AMS') return Promise.resolve(flightOutage());
    return Promise.resolve(flightAnswer([]));
  };

  it('never reads a probe that failed as "no airport flies this route"', async () => {
    const user = userEvent.setup();
    flightReply = byAirport;
    const { container } = renderPage();
    await runCheck(user);

    expect(await screen.findByText(/geen vluchten vanaf/i)).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('.flight-section .live-loading')).toBeNull());
    expect(screen.queryByText(/geen van onze vertrekluchthavens/i)).not.toBeInTheDocument();
    // The airport we could not settle is still offered; the one that answered "none" is not.
    const offered = [...container.querySelectorAll('.flight-section .alt-chip-code')].map((el) => el.textContent);
    expect(offered).toContain('AMS');
    expect(offered).not.toContain('EIN');
  });

  it('asks and offers only the airports on the dashboard\'s active list', async () => {
    const user = userEvent.setup();
    flightReply = byAirport;
    const { container } = renderPage();
    await runCheck(user);
    await screen.findByText(/geen vluchten vanaf/i);
    await waitFor(() => expect(container.querySelector('.flight-section .live-loading')).toBeNull());

    // Charleroi is popular in the seed but switched off in the dashboard.
    expect(flightFroms()).toEqual(expect.arrayContaining(['BRU', 'AMS', 'EIN']));
    expect(flightFroms()).not.toContain('CRL');
    const offered = [...container.querySelectorAll('.flight-section .alt-chip-code')].map((el) => el.textContent);
    expect(offered).toContain('OST');
    expect(offered).not.toContain('CRL');
    within(container.querySelector('.flight-section')).getByText(/of zoek een andere luchthaven/i);
  });
});
