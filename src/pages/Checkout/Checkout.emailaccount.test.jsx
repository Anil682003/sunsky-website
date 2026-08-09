import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';
import { fillContact, fillTraveller, fieldByLabel, contactFields } from '../../test/checkoutForm';

// A guest typing an address they already have a login for is about to create a second identity
// for themselves: the booking would attach to a customer record their account cannot see, and
// the holiday they just paid for would be missing from "my bookings". So the address is checked
// — by the server, which answers one boolean — and the way forward is to sign in.
//
// What the answer must NOT contain is anything about the account: no name, no date, no type.
// Whoever typed the address learns exactly what they would learn by trying to sign in.

const post = vi.fn();
// The default export is CALLED as a function by useApi (an axios instance is callable), as
// well as used as an object — so the mock has to be both, or the config fetch throws an
// unhandled rejection that has nothing to do with what is being tested here.
vi.mock('../../services/axiosInstance', () => {
  const instance = vi.fn(() => Promise.resolve({ data: {} }));
  instance.post = (...a) => post(...a);
  instance.get = vi.fn(() => Promise.resolve({ data: {} }));
  return { default: instance, SUPPLIER_TIMEOUT: 25000 };
});
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useNavigate: () => navigateSpy,
}));

const BOOKING = {
  hotelCode: '300984', hotelName: 'Test Hotel', stars: 4, loc: 'Alanya, Türkiye', img: '',
  board: 'All inclusive', nights: 7, adults: 1, currency: '€',
  ppPrice: 600, dateLabel: '7 Sep — 14 Sep', room: 'Double Room', roomExtra: 0,
  search: {
    destination: 'AYT', origin: 'BRU', transport: 'hotel_only',
    checkin: '2026-09-07', checkout: '2026-09-14', adults: 1, children: 0, rooms: 1,
  },
  api: { hotel: { hotelCode: '300984', checkin: '2026-09-07', checkout: '2026-09-14', nights: 7, rateKey: 'R1', price: 600, currency: '€' } },
};

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false, user: null }, reducers: {} });
const renderCheckout = () => render(
  <Provider store={configureStore({ reducer: { auth: auth.reducer } })}>
    <MemoryRouter initialEntries={[{ pathname: '/checkout', state: { booking: BOOKING } }]}>
      <Routes><Route path="/checkout" element={<Checkout />} /></Routes>
    </MemoryRouter>
  </Provider>
);

const emailInput = () => fieldByLabel('email', contactFields()).querySelector('input');
const panel = () => document.querySelector('.ck-email-known');
const checkCalls = () => post.mock.calls.filter(([url]) => String(url).includes('email-check'));

const answer = (exists) => post.mockImplementation((url) => (
  String(url).includes('email-check')
    ? Promise.resolve({ data: { data: { exists } } })
    : Promise.resolve({ data: {} })
));

beforeEach(() => {
  post.mockReset();
  navigateSpy.mockReset();
  answer(false);
});

describe('an email address that already has an account', () => {
  it('is asked about when the field is left, and lets an unknown address through', async () => {
    const user = userEvent.setup();
    renderCheckout();
    fillContact();
    fillTraveller(0, { dob: '1990-01-01' });

    // Nothing asked while the form is being filled in.
    expect(checkCalls()).toHaveLength(0);

    await user.click(emailInput());
    await user.tab();
    await waitFor(() => expect(checkCalls()).toHaveLength(1));
    expect(checkCalls()[0][1]).toEqual({ email: 'ali@example.com' });

    expect(panel()).toBeFalsy();
    await user.click(screen.getByRole('button', { name: /continue to add-ons/i }));
    await waitFor(() => expect(document.querySelector('.ck-modal')).toBeTruthy());   // got past step 1
  });

  it('stops the booking and offers the two ways in', async () => {
    const user = userEvent.setup();
    answer(true);
    renderCheckout();
    fillContact();
    fillTraveller(0, { dob: '1990-01-01' });

    await user.click(emailInput());
    await user.tab();

    await waitFor(() => expect(panel()).toBeTruthy());
    expect(panel()).toHaveTextContent(/an account already exists with this email address/i);
    expect(panel()).toHaveTextContent(/please log in to continue/i);
    // Nothing about the account itself — no name, no date, no "business account".
    expect(panel().textContent).not.toMatch(/\b(created|registered on|business|private|customer since)\b/i);

    // Cannot continue as a guest.
    await user.click(screen.getByRole('button', { name: /continue to add-ons/i }));
    expect(document.querySelector('.ck-modal')).toBeFalsy();
    expect(document.querySelector('.ck-step.act')).toHaveTextContent(/your details/i);

    // Log in — carrying the booking, so they come back to it instead of an empty checkout.
    await user.click(screen.getByRole('button', { name: /^log in$/i }));
    expect(navigateSpy).toHaveBeenCalledWith('/login', expect.objectContaining({
      state: expect.objectContaining({ from: '/checkout', resume: { booking: BOOKING } }),
    }));

    // …or the reset flow, the same way.
    await user.click(screen.getByRole('button', { name: /forgot your password/i }));
    expect(navigateSpy).toHaveBeenCalledWith('/forgot-password', expect.objectContaining({
      state: expect.objectContaining({ from: '/checkout' }),
    }));
  });

  it('asks before handing over, for someone who never leaves the field', async () => {
    const user = userEvent.setup();
    answer(true);
    renderCheckout();
    fillContact();
    fillTraveller(0, { dob: '1990-01-01' });

    // Straight to Continue — the field was never blurred, so nothing has been asked yet.
    expect(checkCalls()).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /continue to add-ons/i }));

    await waitFor(() => expect(checkCalls()).toHaveLength(1));
    expect(document.querySelector('.ck-modal')).toBeFalsy();      // held at step 1
    await waitFor(() => expect(panel()).toBeTruthy());
  });

  it('does not hold up the checkout when the check cannot be answered', async () => {
    const user = userEvent.setup();
    post.mockImplementation((url) => (
      String(url).includes('email-check') ? Promise.reject(new Error('offline')) : Promise.resolve({ data: {} })
    ));
    renderCheckout();
    fillContact();
    fillTraveller(0, { dob: '1990-01-01' });

    await user.click(emailInput());
    await user.tab();
    await waitFor(() => expect(checkCalls()).toHaveLength(1));

    expect(panel()).toBeFalsy();
    await user.click(screen.getByRole('button', { name: /continue to add-ons/i }));
    await waitFor(() => expect(document.querySelector('.ck-modal')).toBeTruthy());
  });
});
