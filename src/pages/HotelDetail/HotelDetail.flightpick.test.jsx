import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import HotelDetail from './HotelDetail';

// Choosing a flight, as seen in the change-flight modal.
//
// Two faults lived here together, and they made each other worse.
//
// 1. GREEN WAS ON THE WRONG CARD. Green is this page's "you picked this" colour — the chosen
//    room wears it, and so does the flight card's own "Selected" badge. But the green FRAME
//    was wired to `cheapest`, not to `selected`. So the cheapest fare sat in green whether or
//    not it was chosen: move to any other flight and two cards were lit at once, the green one
//    on a flight the traveller had just moved away from, the blue one on the flight they were
//    actually buying.
//
// 2. THE SAME FLIGHT, FOUR TIMES. Airtuerk prices one row per fare class, so one aircraft came
//    back as four cards — identical times, identical baggage, €1,112 / €1,120 / €1,120 /
//    €1,128. Two of them did not differ even in price. Nothing on the card told them apart,
//    because nothing about them WAS different.

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
const CHECK_OUT = iso(37);

const RATES = [
  { roomName: 'Sea View Double', roomCode: 'DBL.SV', boardName: 'ALL INCLUSIVE', boardCode: 'AI', sellingRate: 1180, currency: 'EUR', rateKey: 'k1', cancellationPolicies: [] },
];
const CALENDAR = Array.from({ length: 7 }, (_, i) => ({
  date: iso(27 + i), price: 260 + i * 12, currency: 'EUR', isLowest: i === 0,
}));

// The 17:40 SunExpress out of Brussels from the screenshot, and its 11:25 return.
const OUT_1740 = {
  from: 'BRU', to: 'ADB', airline: 'XQ', flightNumber: '1653',
  departure: `${CHECK_IN}T17:40:00`, arrival: `${CHECK_IN}T22:00:00`, duration: 200,
};
const RET_1125 = {
  from: 'ADB', to: 'BRU', airline: 'XQ', flightNumber: '1652',
  departure: `${CHECK_OUT}T11:25:00`, arrival: `${CHECK_OUT}T14:05:00`, duration: 220,
};
// A genuinely different aircraft: an early-morning departure. This one must survive.
const OUT_0615 = { ...OUT_1740, flightNumber: '1655', departure: `${CHECK_IN}T06:15:00`, arrival: `${CHECK_IN}T10:35:00` };

// One bookable fare class, as the supplier sends it.
const fare = (totalPrice, out, key) => ({
  totalPrice, currency: 'EUR',
  outbound: { legs: [out] },
  inbound: { legs: [RET_1125] },
  flightKeys: [key],
  baggage: { checkedKg: 20, checkedPieces: 0, handKg: 0 },
});

// Four fare classes on the 17:40 (what the screenshot showed), plus one real alternative.
let FLIGHTS = [
  fare(1112, OUT_1740, 'k-1112'),
  fare(1120, OUT_1740, 'k-1120a'),
  fare(1120, OUT_1740, 'k-1120b'),
  fare(1128, OUT_1740, 'k-1128'),
  fare(1150, OUT_0615, 'k-0615'),
];

beforeEach(() => {
  post.mockReset();
  showToast.mockReset();
  post.mockImplementation((url) => {
    const u = String(url);
    if (u.includes('hotel-availability')) {
      return Promise.resolve({ data: { results: { hotelbeds: { rooms: RATES } } } });
    }
    if (u.includes('flight-availability')) {
      return Promise.resolve({ data: { results: { airtuerk: { flights: FLIGHTS } } } });
    }
    return Promise.resolve({ data: {} });
  });
  global.fetch = vi.fn((url) => {
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

// No `transport` param — the page defaults to `package`, which is what runs a flight search.
const renderPage = () => render(
  <Provider store={makeStore()}>
    <MemoryRouter initialEntries={[`/hotel/300984?checkIn=${CHECK_IN}&checkOut=${CHECK_OUT}&adults=2&children=0&rooms=1&nights=7&destination=ADB&name=Test+Hotel`]}>
      <Routes>
        <Route path="/hotel/:hotelCode" element={<HotelDetail />} />
        <Route path="/checkout" element={<div data-testid="checkout">CHECKOUT</div>} />
      </Routes>
    </MemoryRouter>
  </Provider>
);

// Price a day, which is what sends both the room and the flight search.
const runCheck = async (user) => {
  const days = await waitFor(() => {
    const found = screen.getAllByRole('button', { name: /from €\d+/i });
    expect(found.length).toBeGreaterThan(0);
    return found;
  });
  await user.click(days[0]);
  await user.click(await screen.findByRole('button', { name: /check price & availability/i }));
  await waitFor(() => expect(post).toHaveBeenCalledWith(
    expect.stringContaining('flight-availability'), expect.anything(), expect.anything(),
  ));
};

// The cards inside the modal only — the page itself also renders the chosen flight as a card.
const modalCards = (container) => [...container.querySelectorAll('.modal-flights .flight-card')];

describe('the change-flight modal lists flights, not fare classes', () => {
  it('collapses four fare classes on one aircraft into one card', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);

    await waitFor(() => expect(modalCards(container).length).toBeGreaterThan(0));
    // Five rows in, two real choices out: the 17:40 and the 06:15.
    expect(modalCards(container)).toHaveLength(2);
  });

  it('keeps the cheapest of the collapsed group', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);

    await waitFor(() => expect(modalCards(container).length).toBe(2));
    // €1,112, not €1,120 or €1,128 — and the dearer twins are gone from the list.
    expect(modalCards(container)[0].textContent).toContain('1,112');
    expect(container.querySelector('.modal-flights').textContent).not.toContain('1,128');
  });

  it('counts the real options in the "Change flight" button', async () => {
    const user = userEvent.setup();
    renderPage();
    await runCheck(user);
    // One alternative to the chosen flight — not four.
    expect(await screen.findByRole('button', { name: /change flight · 1 more option$/i })).toBeInTheDocument();
  });
});

describe('green marks the flight you chose, and only that one', () => {
  it('starts with the selected flight in green and nothing else', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(modalCards(container).length).toBe(2));

    const green = modalCards(container).filter((c) => c.classList.contains('selected'));
    expect(green).toHaveLength(1);
    // The default pick is the cheapest, so it is the one holding the green frame — and it
    // must NOT also carry `cheapest`, the class that now paints blue.
    expect(green[0].textContent).toContain('1,112');
    expect(green[0].classList.contains('cheapest')).toBe(false);
  });

  it('moves the green to the newly chosen flight and turns the old one blue', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(modalCards(container).length).toBe(2));

    const [cheapest, alternative] = modalCards(container);
    await user.click(alternative.querySelector('.flight-select-btn'));

    await waitFor(() => expect(alternative.classList.contains('selected')).toBe(true));
    // The card just left behind gives the green frame up...
    expect(cheapest.classList.contains('selected')).toBe(false);
    // ...and falls back to the blue "cheapest" marking rather than staying lit in green.
    expect(cheapest.classList.contains('cheapest')).toBe(true);
    // Still exactly one green card on screen — the whole point.
    expect(modalCards(container).filter((c) => c.classList.contains('selected'))).toHaveLength(1);
  });
});

// ── What a card now says about ITSELF ─────────────────────────────────────────
// The list is a choice between the flight the traveller is holding and the others, so each
// card names which it is, and prices itself against the one currently held rather than
// against the cheapest. "€1,150" answers nothing on its own; "+ €38 to your package price"
// is the number the decision is actually made on.
describe('a card says whether it is the one you have, and what switching costs', () => {
  it('labels the held flight and the alternatives', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(modalCards(container).length).toBe(2));

    const [held, alt] = modalCards(container);
    expect(held.querySelector('.fc-status-label').textContent).toMatch(/currently selected/i);
    expect(alt.querySelector('.fc-status-label').textContent).toMatch(/alternative flight/i);
  });

  it('prices each alternative against the flight currently held', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(modalCards(container).length).toBe(2));

    const [held, alt] = modalCards(container);
    // €1,112 held, €1,150 alternative.
    expect(held.querySelector('.fc-impact').textContent).toMatch(/no change to your package price/i);
    expect(alt.querySelector('.fc-impact').textContent).toContain('38');
    expect(alt.querySelector('.fc-impact').className).toContain('up');
  });

  it('re-reckons every card the moment a different flight is chosen', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(modalCards(container).length).toBe(2));

    await user.click(modalCards(container)[1].querySelector('.flight-select-btn'));

    await waitFor(() => {
      const [cheaper, nowHeld] = modalCards(container);
      // The dearer flight is now the baseline, so the cheaper one is a SAVING, not a cost.
      expect(nowHeld.querySelector('.fc-impact').textContent).toMatch(/no change/i);
      expect(cheaper.querySelector('.fc-impact').className).toContain('down');
      expect(cheaper.querySelector('.fc-impact').textContent).toContain('38');
    });
  });

  it('marks the cheapest fare in words, and gives the held card the way out', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(modalCards(container).length).toBe(2));

    const [held, alt] = modalCards(container);
    expect(held.textContent).toMatch(/lowest fare/i);
    // The card you already have offers no "select" — it offers the badge saying you have it.
    expect(held.querySelector('.flight-select-btn')).toBeNull();
    expect(held.querySelector('.flight-selected-badge')).not.toBeNull();
    expect(alt.querySelector('.flight-select-btn').textContent).toMatch(/select this flight/i);
  });
});

// A red-eye lands the morning AFTER it took off. "12:35 … 01:50" with nothing between them
// reads as a flight that arrives before it leaves, and a traveller booking an airport
// transfer off that time books it for the wrong day.
describe('an overnight arrival says which day it lands', () => {
  const ORIGINAL_FLIGHTS = FLIGHTS;
  beforeEach(() => {
    FLIGHTS = [{
      totalPrice: 1121, currency: 'EUR', flightKeys: ['red-eye'],
      baggage: { checkedKg: 25, checkedPieces: 0, handKg: 0 },
      outbound: { legs: [
        { from: 'BRU', to: 'SAW', airline: 'TK', flightNumber: '1942', departure: `${CHECK_IN}T12:35:00`, arrival: `${CHECK_IN}T17:20:00`, duration: 285 },
        { from: 'SAW', to: 'ADB', airline: 'TK', flightNumber: '2318', departure: `${CHECK_IN}T23:40:00`, arrival: `${iso(31)}T01:50:00`, duration: 70 },
      ] },
      inbound: { legs: [RET_1125] },
    }];
  });
  afterEach(() => { FLIGHTS = ORIGINAL_FLIGHTS; });

  it('marks the arrival "+1 day"', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(modalCards(container).length).toBe(1));

    // `.fc-leg`, not `.bp-journey`: the modal card carries the two directions as the same
    // side-by-side columns the page card uses, so the outbound is the first of those.
    const outbound = modalCards(container)[0].querySelector('.fc-leg');
    expect(outbound.textContent).toContain('01:50');
    expect(outbound.querySelector('.bp-nextday').textContent).toBe('+1 day');
  });

  it('says nothing on a flight that lands the same day', async () => {
    FLIGHTS = [fare(1112, OUT_1740, 'same-day')];
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(modalCards(container).length).toBe(1));
    expect(modalCards(container)[0].querySelector('.bp-nextday')).toBeNull();
  });
});

// ── The filter rail ───────────────────────────────────────────────────────────
// Every group is built from the live result set and offered only when it could change the
// list. These three flights differ in exactly the ways the rail filters on.
describe('the filter rail acts on the live results', () => {
  const ORIGINAL_FLIGHTS = FLIGHTS;
  const OUT_VIA_IST_1 = { from: 'BRU', to: 'IST', airline: 'TK', flightNumber: '1940', departure: `${CHECK_IN}T09:00:00`, arrival: `${CHECK_IN}T13:00:00`, duration: 240 };
  const OUT_VIA_IST_2 = { from: 'IST', to: 'ADB', airline: 'TK', flightNumber: '2312', departure: `${CHECK_IN}T15:00:00`, arrival: `${CHECK_IN}T16:10:00`, duration: 70 };

  beforeEach(() => {
    FLIGHTS = [
      // SunExpress, direct, 20kg hold bag.
      fare(1112, OUT_1740, 'k-direct-bags'),
      // SunExpress, direct, hand luggage only — a different purchase at a lower price.
      { ...fare(980, OUT_0615, 'k-direct-nobags'), baggage: { checkedKg: 0, checkedPieces: 0, handKg: 0 } },
      // Turkish, one stop, 20kg.
      { ...fare(1240, OUT_1740, 'k-stop'), outbound: { legs: [OUT_VIA_IST_1, OUT_VIA_IST_2] } },
    ];
  });
  afterEach(() => { FLIGHTS = ORIGINAL_FLIGHTS; });

  // The rail lives inside the modal, which is display:none until it is opened — so these
  // tests open it the way a traveller does rather than reaching into hidden markup.
  const openFilters = async (user) => {
    await runCheck(user);
    await user.click(await screen.findByRole('button', { name: /change flight/i }));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0));
  };

  it('keeps only the direct flights', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await openFilters(user);
    await waitFor(() => expect(modalCards(container).length).toBe(3));

    await user.click(screen.getByRole('checkbox', { name: /direct flights/i }));
    await waitFor(() => expect(modalCards(container).length).toBe(2));
    expect(container.querySelector('.modal-flights').textContent).not.toContain('1,240');
  });

  it('keeps only the flights with a stop', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await openFilters(user);

    await user.click(screen.getByRole('checkbox', { name: /flights with stop/i }));
    await waitFor(() => expect(modalCards(container).length).toBe(1));
    expect(container.querySelector('.modal-flights').textContent).toContain('1,240');
  });

  it('separates the fares that carry a hold bag from the one that does not', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await openFilters(user);

    await user.click(screen.getByRole('checkbox', { name: /include baggage/i }));
    await waitFor(() => expect(modalCards(container).length).toBe(2));

    await user.click(screen.getByRole('checkbox', { name: /exclude baggage/i }));
    await waitFor(() => expect(modalCards(container).length).toBe(1));
    expect(container.querySelector('.modal-flights').textContent).toContain('980');
  });

  it('keeps the flights an airline actually operates', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await openFilters(user);

    await user.click(screen.getByRole('checkbox', { name: /turkish airlines/i }));
    await waitFor(() => expect(modalCards(container).length).toBe(1));
    expect(container.querySelector('.modal-flights').textContent).toContain('1,240');
  });

  it('says how many of the results are left, and puts them all back', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await openFilters(user);

    await user.click(screen.getByRole('checkbox', { name: /flights with stop/i }));
    await waitFor(() => expect(screen.getByText(/1 of 3 flights match/i)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /reset all/i }));
    await waitFor(() => expect(modalCards(container).length).toBe(3));
    expect(screen.getByText(/3 flights found/i)).toBeInTheDocument();
  });

  it('offers a departure-time range built from the real departures', async () => {
    const user = userEvent.setup();
    renderPage();
    await openFilters(user);

    // 06:15 is the earliest outbound in the set and 17:40 the latest — the slider is bounded
    // by the flights that exist, not by a decorative midnight-to-midnight.
    const earliest = await screen.findByRole('slider', { name: /outbound — earliest/i });
    const latest = screen.getByRole('slider', { name: /outbound — latest/i });
    expect(earliest).toHaveAttribute('min', String(6 * 60 + 15));
    expect(latest).toHaveAttribute('max', String(17 * 60 + 40));
  });

  it('drops the flights leaving outside the chosen window', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await openFilters(user);
    await waitFor(() => expect(modalCards(container).length).toBe(3));

    // Pull the late end back to 10:00: only the 06:15 and the 09:00 survive.
    const latest = screen.getByRole('slider', { name: /outbound — latest/i });
    fireEvent.change(latest, { target: { value: String(10 * 60) } });

    await waitFor(() => expect(modalCards(container).length).toBe(2));
    expect(container.querySelector('.modal-flights').textContent).not.toContain('1,112');
  });
});

// ── The page's headline flight card ───────────────────────────────────────────
// One card, two directions side by side, each with its own carrier line and its own
// allowance. The rule that matters: nothing on it is ever a blank space. A one-way has no
// second column to fill, a fare with no stated allowance prints no chips, and the price the
// traveller is committing to stays on the card.
describe('the cheapest-flight card the page leads with', () => {
  const ORIGINAL_FLIGHTS = FLIGHTS;
  const pageCard = (c) => c.querySelector('.flight-card.bannered');
  afterEach(() => { FLIGHTS = ORIGINAL_FLIGHTS; });

  it('gives each direction its own column, side by side', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(pageCard(container)).not.toBeNull());

    const legs = pageCard(container).querySelectorAll('.fc-leg');
    expect(legs).toHaveLength(2);
    expect(legs[0].textContent).toMatch(/outbound/i);
    expect(legs[1].textContent).toMatch(/return/i);
    // Two columns, not the one-way full-width layout.
    expect(pageCard(container).querySelector('.fc-legs').className).not.toContain('fc-legs-one');
  });

  it('names the carrier on its own line in each column', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(pageCard(container)).not.toBeNull());

    const rows = pageCard(container).querySelectorAll('.fc-leg .bp-airrow');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('SunExpress');
    expect(rows[0].textContent).toContain('XQ 1653');
  });

  it('prints the allowance under each direction, where it is checked', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(pageCard(container)).not.toBeNull());

    const legs = pageCard(container).querySelectorAll('.fc-leg');
    for (const leg of legs) {
      expect(leg.textContent).toMatch(/checked baggage 20 kg/i);
      expect(leg.textContent).toMatch(/cabin bag included/i);
    }
  });

  // Half a card of white space is not a design, it is a missing column.
  it('gives a one-way the whole width instead of an empty second column', async () => {
    FLIGHTS = [{ ...fare(1112, OUT_1740, 'one-way'), inbound: { legs: [] } }];
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(pageCard(container)).not.toBeNull());

    expect(pageCard(container).querySelectorAll('.fc-leg')).toHaveLength(1);
    expect(pageCard(container).querySelector('.fc-legs').className).toContain('fc-legs-one');
  });

  // An allowance the supplier never stated earns no chip — an empty pill would be a claim.
  it('prints no baggage chips when the supplier stated no allowance', async () => {
    FLIGHTS = [{ ...fare(1112, OUT_1740, 'no-bags'), baggage: null }];
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(pageCard(container)).not.toBeNull());

    expect(pageCard(container).querySelectorAll('.bp-chip')).toHaveLength(0);
    // The rest of the card is still whole: times, carrier, price, the way on.
    expect(pageCard(container).querySelector('.bp-airrow')).not.toBeNull();
    expect(pageCard(container).textContent).toContain('1,112');
  });

  it('keeps the fare and the way into the details on the card', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(pageCard(container)).not.toBeNull());

    const card = pageCard(container);
    expect(card.textContent).toContain('1,112');
    expect(card.textContent).toMatch(/total for all travellers/i);
    expect(card.querySelector('.fc-selected-lg').textContent).toMatch(/selected/i);
    expect(card.querySelector('.flight-details-btn')).not.toBeNull();
  });

  it('says in the band why this flight was chosen', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(pageCard(container)).not.toBeNull());

    const band = pageCard(container).querySelector('.fc-banner');
    expect(band.textContent).toMatch(/cheapest flight/i);
    expect(band.textContent).toMatch(/automatically selected for your travel dates/i);
    expect(band.textContent).toMatch(/best-priced flight option/i);
  });
});
