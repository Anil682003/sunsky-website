import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';

// A non-refundable room is the one condition a traveller cannot undo after paying, so it is
// said again at the payment step and needs its OWN tick — the general conditions checkbox does
// not stand in for it. What gets recorded with the booking is the sentence they were shown,
// with the moment they accepted it and the rate it was about.
//
// It appears ONLY when the selected rate really is non-refundable: a rate with a free
// cancellation deadline still in the future must never be labelled this way.

const post = vi.fn();
vi.mock('../../services/axiosInstance', () => ({
  default: { post: (...a) => post(...a), get: vi.fn(() => Promise.resolve({ data: {} })) },
  SUPPLIER_TIMEOUT: 25000,
}));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const bookingWith = (cancellation) => ({
  hotelCode: '300984', hotelName: 'Test Hotel', stars: 4, loc: 'Alanya, Türkiye', img: '',
  board: 'All inclusive', nights: 7, adults: 1, currency: '€',
  ppPrice: 600, dateLabel: '7 Sep — 14 Sep', flight: null, room: 'Double Room', roomExtra: 0,
  search: { adults: 1, children: 0, rooms: 1, checkin: '2026-09-07', checkout: '2026-09-14' },
  api: {
    hotel: {
      hotelCode: '300984', checkin: '2026-09-07', checkout: '2026-09-14', nights: 7,
      rateKey: 'RATE-1', roomCode: 'DBL', boardCode: 'AI', price: 600, currency: '€',
      supplier: 'hotelbeds', cancellation,
    },
  },
});
// A penalty that started yesterday for the full price → cancelling costs everything today.
const NON_REFUNDABLE = [{ from: '2020-01-01T00:00:00+02:00', amount: '600.00' }];
// A free-cancellation deadline far in the future → refundable, however large the penalty after.
const REFUNDABLE = [{ from: '2099-01-01T00:00:00+02:00', amount: '600.00' }];

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false, user: null }, reducers: {} });
const renderCheckout = (booking) => render(
  <Provider store={configureStore({ reducer: { auth: auth.reducer } })}>
    <MemoryRouter initialEntries={[{ pathname: '/checkout', state: { booking } }]}>
      <Routes><Route path="/checkout" element={<Checkout />} /></Routes>
    </MemoryRouter>
  </Provider>
);

// Fill step 1 for a single traveller and walk to the payment step through the name check.
const reachPayment = async (user) => {
  const fields = [...document.querySelectorAll('.ck-field')];
  const input = (i) => fields[i].querySelector('input, select');
  await user.type(input(0), 'Ali');
  await user.type(input(1), 'Benli');
  await user.selectOptions(input(4), input(4).options[1].value);
  await user.type(input(6), 'ali@example.com');
  await user.type(input(7), '+32475123456');
  await user.type(input(15), 'Ali');
  await user.type(input(16), 'Benli');
  await user.selectOptions(input(18), input(18).options[1].value);
  await user.type(input(19), '1995-11-19');

  await user.click(screen.getByRole('button', { name: /continue to add-ons/i }));
  await waitFor(() => expect(document.querySelector('.ck-modal')).toBeTruthy());
  await user.click(document.querySelector('.ck-modal .ck-check'));
  await user.click(document.querySelector('.ck-rv-confirm'));
  await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/add-ons/i));
  await user.click(screen.getByRole('button', { name: /continue to payment/i }));
  await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/payment/i));
  // Bancontact rather than card: this is a test about the cancellation consent, and the card
  // form's own validation (name, number, expiry, CVC) is not what is being exercised here.
  await user.click(screen.getByRole('button', { name: /bancontact/i }));
};

const warning = () => document.querySelector('.ck-nr');
const payBtn = () => screen.getByRole('button', { name: /^pay /i });

beforeEach(() => {
  post.mockReset();
  post.mockImplementation(() => Promise.resolve({ data: {} }));
});

describe('a non-refundable room at the payment step', () => {
  it('will not take a payment until its own condition is accepted', async () => {
    const user = userEvent.setup();
    renderCheckout(bookingWith(NON_REFUNDABLE));
    await reachPayment(user);

    expect(warning()).toBeTruthy();
    expect(warning()).toHaveTextContent(/100% cancellation costs apply to this accommodation/i);
    expect(warning()).toHaveTextContent(/from the moment the booking is confirmed/i);
    // Unticked by default — a pre-ticked acceptance is not an acceptance.
    expect(warning().querySelector('.ck-check.on')).toBeFalsy();

    // Accepting the GENERAL conditions is not enough.
    const generalTick = [...document.querySelectorAll('.ck-check')]
      .find((el) => /i agree to the above conditions/i.test(el.textContent));
    await user.click(generalTick);
    await user.click(payBtn());
    await waitFor(() => expect(warning()).toHaveTextContent(/please confirm you accept the cancellation costs/i));
    // Nothing was sent to the server.
    expect(post.mock.calls.filter(([url]) => String(url).includes('online-bookings'))).toHaveLength(0);

    // With its own tick, the booking goes — carrying the words that were on screen.
    await user.click(warning().querySelector('.ck-check'));
    await user.click(payBtn());
    await waitFor(() => expect(post.mock.calls.some(([url]) => String(url).includes('online-bookings'))).toBe(true));

    const [, body] = post.mock.calls.find(([url]) => String(url).includes('online-bookings'));
    const nr = body.consents.find((c) => c.code === 'NON_REFUNDABLE_ACCOMMODATION');
    expect(nr).toBeTruthy();
    expect(nr.text).toMatch(/100% cancellation costs apply to this accommodation/i);
    expect(nr.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(nr.scope).toMatchObject({ product: 'hotel', rateKey: 'RATE-1' });
    // And the flag the server enforces against.
    expect(body.hotel.nonRefundable).toBe(true);
    // The general conditions are recorded too, as their own consent.
    expect(body.consents.some((c) => c.code === 'BOOKING_CONDITIONS')).toBe(true);
  });

  it('says nothing when the rate can still be cancelled for free', async () => {
    const user = userEvent.setup();
    renderCheckout(bookingWith(REFUNDABLE));
    await reachPayment(user);

    expect(warning()).toBeFalsy();
    const generalTick = [...document.querySelectorAll('.ck-check')]
      .find((el) => /i agree to the above conditions/i.test(el.textContent));
    await user.click(generalTick);
    await user.click(payBtn());

    await waitFor(() => expect(post.mock.calls.some(([url]) => String(url).includes('online-bookings'))).toBe(true));
    const [, body] = post.mock.calls.find(([url]) => String(url).includes('online-bookings'));
    expect(body.hotel.nonRefundable).toBe(false);
    expect(body.consents.some((c) => c.code === 'NON_REFUNDABLE_ACCOMMODATION')).toBe(false);
  });
});
