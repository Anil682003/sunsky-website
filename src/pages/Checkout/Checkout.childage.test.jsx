import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';
import { setDob } from '../../test/checkoutForm';

// A child's age is what made the holiday cheap, and the checkout is where somebody would try
// to keep the price while booking for an adult. So EVERY child slot the search described is
// measured against the age it was PRICED at — including a slot whose date never arrived,
// which is precisely the case an edited age on the results page used to create.
//
// The check is not cosmetic: the supplier is asked again, payment is blocked while it runs,
// and a changed price has to be accepted. Nobody is stopped from correcting a real mistake;
// they are stopped from paying yesterday's price for a different party.

const CHECK_IN = '2026-09-07';
const CHECK_OUT = '2026-09-14';

// A search that priced a 10-year-old but carries NO date for them — an older link, or an age
// edited on the results page before dates were collected there.
const BOOKING = {
  hotelCode: '300984', hotelName: 'Test Hotel', stars: 4, loc: 'Alanya, Türkiye', img: '',
  board: 'All inclusive', nights: 7, adults: 2, currency: '€',
  ppPrice: 300, dateLabel: '7 Sep — 14 Sep', room: 'Family Room', roomExtra: 0,
  search: {
    destination: 'AYT', origin: 'BRU', transport: 'hotel_only',
    checkin: CHECK_IN, checkout: CHECK_OUT, nights: 7,
    adults: 1, children: 1, rooms: 1,
    childAges: '10', childDobs: '',            // ← priced as a child, no date carried
    roomCode: 'FAM.ST', boardCode: 'AI',
  },
  api: {
    hotel: {
      hotelCode: '300984', checkin: CHECK_IN, checkout: CHECK_OUT, nights: 7,
      rateKey: 'CHILD-RATE', roomCode: 'FAM.ST', boardCode: 'AI',
      price: 600, currency: '€', supplier: 'hotelbeds',
    },
  },
};

const post = vi.fn();
vi.mock('../../services/axiosInstance', () => ({
  default: { post: (...a) => post(...a), get: vi.fn(() => Promise.resolve({ data: {} })) },
  SUPPLIER_TIMEOUT: 25000,
}));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

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

const childCard = () => [...document.querySelectorAll('.ck-trav')][1];   // 1 adult, then the child
const panel = () => document.querySelector('.ck-rp');
const cta = () => screen.getByRole('button', { name: /continue to add-ons|re-checking/i });

beforeEach(() => {
  post.mockReset();
  post.mockImplementation((url) => (String(url).includes('hotel-availability')
    ? Promise.resolve(roomsAt(980))     // an adult in the room costs more
    : Promise.resolve({ data: {} })));
});

describe('a child slot with no date carried from the search', () => {
  it('says what it was priced as', async () => {
    renderCheckout();
    await waitFor(() => expect(childCard()).toBeTruthy());
    // Editable (nothing to lock), but not silent about the age behind the price.
    expect(childCard().querySelector('input[type="date"]')).toBeTruthy();
    expect(childCard()).toHaveTextContent(/priced as a 10-year-old/i);
  });

  it('re-checks the price when the date typed is not that age, and blocks payment until accepted', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await waitFor(() => expect(childCard()).toBeTruthy());

    // The gaming move: quoted for a 10-year-old, book a 30-year-old.
    setDob(childCard(), '1996-01-01');

    await waitFor(() => expect(panel()).toBeTruthy(), { timeout: 3000 });
    await waitFor(() => expect(panel()).toHaveTextContent(/the price for this holiday has changed/i), { timeout: 3000 });

    // The supplier was asked for the party actually being booked: two adults, no child.
    const call = post.mock.calls.find(([url]) => String(url).includes('hotel-availability'));
    expect(call[1]).toMatchObject({ adults: 2, children: 0, childAges: [] });

    // And nothing moves until the new price is accepted.
    expect(cta()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /accept the new price/i }));
    await waitFor(() => expect(panel()).toHaveTextContent(/new price accepted/i));
    expect(cta()).toBeEnabled();
  });

  it('asks nobody anything when the date matches the age it was priced at', async () => {
    renderCheckout();
    await waitFor(() => expect(childCard()).toBeTruthy());

    // Born 2016-09-07 → exactly 10 on the check-in date: the price cannot have moved.
    setDob(childCard(), '2016-09-07');

    await new Promise((r) => setTimeout(r, 1100));   // past the debounce
    expect(post.mock.calls.filter(([url]) => String(url).includes('availability'))).toHaveLength(0);
    expect(panel()).toBeFalsy();
  });
});
