import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';
import { setDob } from '../../test/checkoutForm';

// A child's date of birth priced the holiday: the room was quoted for a party of certain ages
// and the fare for certain passenger types. So the checkout arrives with that date already
// filled and read-only, opens it only behind a warning, and when the AGE really changes it
// asks the supplier again before anyone can pay.
//
// The server re-prices from these same dates of birth (paxCounts → priceAirtuerkFlight,
// checkrates on the rateKey), so an accepted re-check must also replace the rateKey the
// booking carries — otherwise the supplier books a room priced for a child who doesn't exist.

const CHECK_IN = '2026-09-07';
const CHECK_OUT = '2026-09-14';
// Born 2016-09-07 → exactly 10 on the check-in date.
const CHILD_DOB = '2016-09-07';

const BOOKING = {
  hotelCode: '300984', hotelName: 'Test Hotel', stars: 4, loc: 'Alanya, Türkiye', img: '',
  board: 'All inclusive', nights: 7, adults: 3, currency: '€',
  ppPrice: 200, dateLabel: '7 Sep — 14 Sep', flight: null, room: 'Family Room', roomExtra: 0,
  search: {
    destination: 'AYT', origin: 'BRU', transport: 'package',
    checkin: CHECK_IN, checkout: CHECK_OUT, nights: 7,
    adults: 2, children: 1, rooms: 1,
    childAges: '10', childDobs: CHILD_DOB,
    roomCode: 'FAM.ST', boardCode: 'AI',
  },
  api: {
    hotel: {
      hotelCode: '300984', checkin: CHECK_IN, checkout: CHECK_OUT, nights: 7,
      rateKey: 'OLD-RATE-KEY', roomCode: 'FAM.ST', boardCode: 'AI',
      price: 600, currency: '€', supplier: 'hotelbeds',
    },
  },
};

const post = vi.fn();
// The default export is CALLED as a function by useApi (an axios instance is callable) as
// well as used as an object, so the mock has to be both — otherwise the checkout's config
// fetch throws an unhandled rejection that has nothing to do with the test.
vi.mock('../../services/axiosInstance', () => {
  const instance = vi.fn(() => Promise.resolve({ data: {} }));
  instance.post = (...a) => post(...a);
  instance.get = vi.fn(() => Promise.resolve({ data: {} }));
  return { default: instance, SUPPLIER_TIMEOUT: 25000 };
});
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

// One room, priced for whatever party the request carried.
const roomsAt = (price) => ({
  data: { results: { hotelbeds: { rooms: [{
    roomName: 'Family Room', roomCode: 'FAM.ST', boardName: 'All Inclusive', boardCode: 'AI',
    sellingRate: price, currency: 'EUR', rateKey: `RATE-${price}`, cancellationPolicies: [],
  }] } } },
});

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false, user: null }, reducers: {} });
const renderCheckout = () => render(
  <Provider store={configureStore({ reducer: { auth: auth.reducer } })}>
    <MemoryRouter initialEntries={[{ pathname: '/checkout', state: { booking: BOOKING } }]}>
      <Routes><Route path="/checkout" element={<Checkout />} /></Routes>
    </MemoryRouter>
  </Provider>
);

const dobRows = () => [...document.querySelectorAll('.ck-dob-lock')];
const panel = () => document.querySelector('.ck-rp');
const cta = () => screen.getByRole('button', { name: /continue to add-ons|re-checking/i });

// What each traveller card's editable date of birth reads. A locked row has no input at all —
// it prints the date instead of offering it — so it contributes ''.
const dobValues = () => [...document.querySelectorAll('.ck-trav')]
  .map((card) => card.querySelector('input[type="date"]')?.value || '');

// Open the child's date of birth and put a new one in. The child row is the third traveller
// (2 adults + 1 child), and its is the only card with a locked date to open.
const changeChildDob = async (user, iso) => {
  await user.click(screen.getByRole('button', { name: /^change$/i }));
  await user.click(screen.getByRole('button', { name: /change date of birth/i }));
  const card = [...document.querySelectorAll('.ck-trav')][2];
  expect(setDob(card, iso), 'the unlocked date field').toBe(true);
};

beforeEach(() => {
  post.mockReset();
  post.mockImplementation(() => Promise.resolve({ data: {} }));
});

describe('a child date of birth from the search', () => {
  it('arrives filled, read-only, and only opens behind the warning', async () => {
    const user = userEvent.setup();
    renderCheckout();

    // One locked row — the child's. The adults were never asked in the search.
    await waitFor(() => expect(dobRows()).toHaveLength(1));
    expect(dobRows()[0]).toHaveTextContent('07/09/2016');
    expect(dobRows()[0]).toHaveTextContent(/child/i);
    // No editable field holds that date — the adults' own date fields are untouched by this.
    expect(dobValues()).not.toContain(CHILD_DOB);

    // The warning comes first, in the client's words, and can be declined.
    await user.click(screen.getByRole('button', { name: /^change$/i }));
    const warn = document.querySelector('.ck-dob-warn');
    expect(warn).toHaveTextContent(/may affect the price or availability/i);
    expect(warn).toHaveTextContent(/check this automatically before you continue/i);
    await user.click(screen.getByRole('button', { name: /keep 07\/09\/2016/i }));
    expect(document.querySelector('.ck-dob-warn')).toBeFalsy();
    expect(dobRows()).toHaveLength(1);              // still locked

    // Accepting it opens the field.
    await user.click(screen.getByRole('button', { name: /^change$/i }));
    await user.click(screen.getByRole('button', { name: /change date of birth/i }));
    expect(dobRows()).toHaveLength(0);
    // Opened, and pre-filled with the searched date rather than blank.
    expect(dobValues()).toContain(CHILD_DOB);
  });

  it('asks the supplier again, blocks payment while it waits, and needs a changed price accepted', async () => {
    const user = userEvent.setup();
    post.mockImplementation((url) => {
      if (String(url).includes('hotel-availability')) return Promise.resolve(roomsAt(740));
      return Promise.resolve({ data: {} });
    });
    renderCheckout();
    await waitFor(() => expect(dobRows()).toHaveLength(1));

    // 2013 → 13 years old on check-in: a different age, and a different fare type.
    await changeChildDob(user, '2013-09-07');

    await waitFor(() => expect(panel()).toBeTruthy(), { timeout: 3000 });
    await waitFor(() => expect(panel()).toHaveTextContent(/the price for this holiday has changed/i), { timeout: 3000 });

    // The supplier was asked with the CORRECTED party: the 13-year-old counts as an adult and
    // no longer has a child age.
    const call = post.mock.calls.find(([url]) => String(url).includes('hotel-availability'));
    expect(call[1]).toMatchObject({ adults: 3, children: 0, childAges: [] });

    // Nothing can move forward until the new price is accepted.
    expect(cta()).toBeDisabled();
    expect(panel()).toHaveTextContent('€620');     // 600 + 20 SGR, before
    expect(panel()).toHaveTextContent('€760');     // 740 + 20 SGR, after

    await user.click(screen.getByRole('button', { name: /accept the new price/i }));
    await waitFor(() => expect(panel()).toHaveTextContent(/new price accepted/i));
    expect(cta()).toBeEnabled();
    // And the money the page works from is the accepted quote, not the one it arrived with:
    // the stay line in the summary is now the re-priced room.
    const stayLine = [...document.querySelectorAll('.ck-sum-row')][0];
    expect(stayLine).toHaveTextContent('€740');
    expect(panel()).toHaveTextContent('€760 total');
  });

  it('says so plainly when the corrected party has no room, and stays in the checkout', async () => {
    const user = userEvent.setup();
    post.mockImplementation((url) => {
      if (String(url).includes('hotel-availability')) {
        return Promise.resolve({ data: { results: { hotelbeds: { rooms: [] } } } });
      }
      return Promise.resolve({ data: {} });
    });
    renderCheckout();
    await waitFor(() => expect(dobRows()).toHaveLength(1));

    await changeChildDob(user, '2013-09-07');

    await waitFor(() => expect(panel()).toHaveTextContent(/not available for the updated traveller details/i), { timeout: 3000 });
    expect(cta()).toBeDisabled();
    // Still on the checkout, on step 1 — never bounced back to the search.
    expect(document.querySelector('.ck-step.act')).toHaveTextContent(/your details/i);

    // Putting the searched date back restores the priced holiday and clears the block.
    await user.click(screen.getByRole('button', { name: /put the original date back/i }));
    await waitFor(() => expect(panel()).toBeFalsy());
    expect(dobRows()[0]).toHaveTextContent('07/09/2016');
    expect(cta()).toBeEnabled();
  });

  it('does not call the supplier when only the day changes inside the same age', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await waitFor(() => expect(dobRows()).toHaveLength(1));

    // 2016-09-07 → 2016-03-04: still 10 on the check-in date, so no price can move and no
    // supplier is asked. (Every availability call we make carries ages, never dates.)
    await changeChildDob(user, '2016-03-04');

    await new Promise((r) => setTimeout(r, 1100));   // past the debounce
    expect(post.mock.calls.filter(([url]) => String(url).includes('availability'))).toHaveLength(0);
    expect(panel()).toBeFalsy();
    expect(cta()).toBeEnabled();
  });
});
