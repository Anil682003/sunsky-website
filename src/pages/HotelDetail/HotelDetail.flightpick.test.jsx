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
    const found = screen.getAllByRole('button', { name: /vanaf €\d+/i });
    expect(found.length).toBeGreaterThan(0);
    return found;
  });
  await user.click(days[0]);
  await user.click(await screen.findByRole('button', { name: /prijs & beschikbaarheid controleren/i }));
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
    // The fare is no longer printed on a card, so the survivor is identified by its
    // departure and PRICED by the swing on the other one: €1,150 against a €1,112 baseline
    // is +€19.00 each for two adults. Had the dedupe kept the €1,120 twin it would read
    // +€15.00, so this asserts the cheapest of the collapsed group is the one held.
    expect(modalCards(container)[0].textContent).toContain('17:40');
    expect(modalCards(container)[1].querySelector('.fc-swing').textContent).toContain('19.00');
  });

  it('counts the real options in the "Choose another flight" control', async () => {
    const user = userEvent.setup();
    renderPage();
    await runCheck(user);
    // Two flights to choose between — not the four fares the supplier returned.
    expect(await screen.findByRole('button', { name: /kies een andere vlucht · 2 opties$/i })).toBeInTheDocument();
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
    expect(green[0].textContent).toContain('17:40');
    expect(green[0].classList.contains('cheapest')).toBe(false);
  });

  it('moves the green to the newly chosen flight and turns the old one blue', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(modalCards(container).length).toBe(2));

    const [cheapest, alternative] = modalCards(container);
    await user.click(alternative.querySelector('.fc-pick'));

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
// card prices itself against the one currently held rather than against the cheapest.
// "€1,150" answers nothing on its own; "+ €19.00 per person" is the number the decision is
// actually made on. The whole-party figure is the same fact multiplied, so it is not printed
// twice, and the card does not label itself "Alternative flight" in a list of alternatives.
describe('a card says what switching to it costs, and offers the switch', () => {
  it('prices each alternative per person against the flight currently held', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(modalCards(container).length).toBe(2));

    const [held, alt] = modalCards(container);
    // €1,112 held, €1,150 alternative — €38 the party, two adults.
    expect(held.querySelector('.fc-swing')).toBeNull();      // it is the one you have
    expect(alt.querySelector('.fc-swing').textContent).toContain('19.00');
    expect(alt.querySelector('.fc-swing').className).toContain('up');
    expect(alt.querySelector('.fc-swing-cap').textContent).toMatch(/per persoon/i);
  });

  it('re-reckons every card the moment a different flight is chosen', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(modalCards(container).length).toBe(2));

    await user.click(modalCards(container)[1].querySelector('.fc-pick'));

    await waitFor(() => {
      const [cheaper, nowHeld] = modalCards(container);
      // The dearer flight is now the baseline, so the cheaper one is a SAVING, not a cost.
      expect(nowHeld.querySelector('.fc-pick')).toBeNull();
      expect(cheaper.querySelector('.fc-swing').className).toContain('down');
      expect(cheaper.querySelector('.fc-swing').textContent).toContain('19.00');
    });
  });

  it('gives the held card a badge instead of a way to pick it again', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(modalCards(container).length).toBe(2));

    const [held, alt] = modalCards(container);
    expect(held.querySelector('.fc-pick')).toBeNull();
    expect(held.querySelector('.flight-selected-badge').textContent).toMatch(/geselecteerd/i);
    expect(alt.querySelector('.fc-pick').getAttribute('aria-label')).toMatch(/deze vlucht selecteren/i);
    expect(alt.querySelector('.fc-pick').getAttribute('role')).toBe('radio');
  });

  // The floor of the set still says so in words — but only on a card the traveller has NOT
  // taken. On the one they are holding, "Selected" is the whole message.
  it('names the lowest fare only while it is still an alternative', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(modalCards(container).length).toBe(2));

    expect(modalCards(container)[0].textContent).not.toMatch(/laagste tarief/i);

    // Take the dearer one; the cheapest is now an alternative and earns the chip.
    await user.click(modalCards(container)[1].querySelector('.fc-pick'));
    await waitFor(() => {
      expect(modalCards(container)[0].querySelector('.fc-best').textContent).toMatch(/laagste tarief/i);
    });
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
    await user.click(await screen.findByRole('button', { name: /kies een andere vlucht/i }));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0));
  };

  it('keeps only the direct flights', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await openFilters(user);
    await waitFor(() => expect(modalCards(container).length).toBe(3));

    await user.click(screen.getByRole('checkbox', { name: /rechtstreekse vluchten/i }));
    await waitFor(() => expect(modalCards(container).length).toBe(2));
    expect(container.querySelector('.modal-flights').textContent).not.toContain('Turkish');
  });

  it('keeps only the flights with a stop', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await openFilters(user);

    await user.click(screen.getByRole('checkbox', { name: /vluchten met tussenstop/i }));
    await waitFor(() => expect(modalCards(container).length).toBe(1));
    expect(container.querySelector('.modal-flights').textContent).toContain('Turkish');
  });

  it('separates the fares that carry a hold bag from the one that does not', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await openFilters(user);

    await user.click(screen.getByRole('checkbox', { name: /met ruimbagage/i }));
    await waitFor(() => expect(modalCards(container).length).toBe(2));

    await user.click(screen.getByRole('checkbox', { name: /zonder ruimbagage/i }));
    await waitFor(() => expect(modalCards(container).length).toBe(1));
    expect(container.querySelector('.modal-flights').textContent).toContain('06:15');
  });

  it('keeps the flights an airline actually operates', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await openFilters(user);

    await user.click(screen.getByRole('checkbox', { name: /turkish airlines/i }));
    await waitFor(() => expect(modalCards(container).length).toBe(1));
    expect(container.querySelector('.modal-flights').textContent).toContain('TK 1940');
  });

  it('says how many of the results are left, and puts them all back', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await openFilters(user);

    await user.click(screen.getByRole('checkbox', { name: /vluchten met tussenstop/i }));
    await waitFor(() => expect(screen.getByText(/1 van 3 vluchten komen overeen/i)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /alle filters resetten/i }));
    await waitFor(() => expect(modalCards(container).length).toBe(3));
    expect(screen.getByText(/3 vluchten gevonden/i)).toBeInTheDocument();
  });

  /* The rail folds away to a tab so the cards get the width back, and the tab carries the
     count so a traveller never loses sight of a filter that is still narrowing the list.
     (jsdom applies no media queries, so both controls are in the DOM at once; what is
     asserted is the state the CSS keys off.) */
  it('folds the rail away and brings it back, with the count on the tab', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await openFilters(user);

    const body = () => container.querySelector('.modal-body');
    expect(body().className).toContain('rail-open');

    await user.click(screen.getByRole('checkbox', { name: /vluchten met tussenstop/i }));
    // Queried by class, not by role: both controls are `display:none` until the media query
    // that owns them matches, and jsdom evaluates no media queries.
    await user.click(container.querySelector('.modal-rail-fold'));

    await waitFor(() => expect(body().className).not.toContain('rail-open'));
    expect(container.querySelector('.modal-rail-tab').textContent).toContain('Filters · 1');

    await user.click(container.querySelector('.modal-rail-tab'));
    await waitFor(() => expect(body().className).toContain('rail-open'));
    // The filter it was folded over is still on.
    expect(modalCards(container)).toHaveLength(1);
  });

  it('offers a departure-time range built from the real departures', async () => {
    const user = userEvent.setup();
    renderPage();
    await openFilters(user);

    // 06:15 is the earliest outbound in the set and 17:40 the latest — the slider is bounded
    // by the flights that exist, not by a decorative midnight-to-midnight.
    const earliest = await screen.findByRole('slider', { name: /heenreis — vroegst/i });
    const latest = screen.getByRole('slider', { name: /heenreis — laatst/i });
    expect(earliest).toHaveAttribute('min', String(6 * 60 + 15));
    expect(latest).toHaveAttribute('max', String(17 * 60 + 40));
  });

  it('drops the flights leaving outside the chosen window', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await openFilters(user);
    await waitFor(() => expect(modalCards(container).length).toBe(3));

    // Pull the late end back to 10:00: only the 06:15 and the 09:00 survive.
    const latest = screen.getByRole('slider', { name: /heenreis — laatst/i });
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
    expect(legs[0].textContent).toMatch(/heenreis/i);
    expect(legs[1].textContent).toMatch(/terugreis/i);
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

  // The allowance is a term of the FARE, not of a leg, so printing it under both directions
  // said the same thing twice. It lives in the Baggage tab of the details dialog now, where
  // it can be answered properly — weights, pieces, per flight.
  it('leaves the allowance to the details dialog instead of repeating it per direction', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(pageCard(container)).not.toBeNull());

    for (const leg of pageCard(container).querySelectorAll('.fc-leg')) {
      expect(leg.textContent).not.toMatch(/ruimbagage/i);
    }
    // …and the way to it is still on the card.
    expect(pageCard(container).querySelector('.flight-details-btn').textContent)
      .toMatch(/vluchtdetails bekijken/i);
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
    // The rest of the card is still whole: times, carrier, the way on.
    expect(pageCard(container).querySelector('.bp-airrow')).not.toBeNull();
    expect(pageCard(container).querySelector('.flight-details-btn')).not.toBeNull();
  });

  /* The fare is NOT repeated here. The holiday's price is stated above this card and again at
     the overview; a third figure in between only asked the traveller to check whether the
     three matched. What the footer carries instead is what the price covers. */
  it('leaves the fare to the price panels and states what the price covers', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(pageCard(container)).not.toBeNull());

    const foot = pageCard(container).querySelector('.flight-bottom');
    expect(foot.textContent).not.toContain('1,112');
    expect(foot.textContent).not.toMatch(/totaal voor alle reizigers/i);
    expect(foot.querySelector('.fc-allin').textContent)
      .toMatch(/prijzen zijn inclusief belastingen en kosten/i);
    expect(foot.querySelector('.flight-details-btn')).not.toBeNull();
  });

  it('heads the card with what it is, why it was picked, and that it is picked', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await runCheck(user);
    await waitFor(() => expect(pageCard(container)).not.toBeNull());

    const band = pageCard(container).querySelector('.fc-banner');
    expect(band.querySelector('.fc-banner-pill').textContent).toMatch(/beste prijs/i);
    expect(band.querySelector('.fc-banner-title').textContent).toMatch(/jouw vluchten/i);
    expect(band.querySelector('.fc-banner-sub').textContent)
      .toMatch(/automatisch gekozen voor jouw reisdata/i);
    // The status belongs at the top of the card, opposite the heading, not at its foot.
    expect(band.querySelector('.fc-selected-lg').textContent).toMatch(/geselecteerd/i);
    expect(pageCard(container).querySelector('.flight-bottom .fc-selected-lg')).toBeNull();
  });
});
