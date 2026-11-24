import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';
import { fillStepOne } from '../../test/checkoutForm';

// The main booker must be 18 or older on the day of booking (Levent, 24 Nov 2026). Travellers
// under 18 can still travel; they cannot be the booker. The server refuses the same.

const BOOKING = {
  hotelCode: '300984', hotelName: 'Test Hotel', stars: 4, loc: 'Alanya, Türkiye', img: '',
  board: 'All inclusive', nights: 7, adults: 2, currency: '€',
  ppPrice: 192, dateLabel: '7 Sep — 14 Sep', flight: null, room: 'Double Room', roomExtra: 0,
  meal: 'All inclusive',
  api: { hotel: { hotelCode: '300984', price: 384, currency: '€' } },
};

vi.mock('../../services/axiosInstance', () => {
  const instance = vi.fn(() => Promise.resolve({ data: {} }));
  instance.post = vi.fn(() => Promise.resolve({ data: {} }));
  instance.get = vi.fn(() => Promise.resolve({ data: {} }));
  return { default: instance, SUPPLIER_TIMEOUT: 25000 };
});
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false, user: null }, reducers: {} });
const renderCheckout = () => render(
  <Provider store={configureStore({ reducer: { auth: auth.reducer } })}>
    <MemoryRouter initialEntries={[{ pathname: '/checkout', state: { booking: BOOKING } }]}>
      <Routes><Route path="/checkout" element={<Checkout />} /></Routes>
    </MemoryRouter>
  </Provider>
);
const cta = () => screen.getByRole('button', { name: /doorgaan naar extra's/i });
const yearsAgo = (n, extraDays = 0) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  d.setDate(d.getDate() + extraDays);
  return d.toISOString().slice(0, 10);
};

describe('the main booker is 18 or older', () => {
  it('a 17-year-old booker cannot continue, and is told travellers under 18 may still travel', async () => {
    const user = userEvent.setup();
    renderCheckout();
    fillStepOne({ contact: { dateOfBirth: yearsAgo(18, 2) } });   // turns 18 in two days
    await user.click(cta());
    expect(await screen.findByText(/hoofdboeker moet minstens 18 jaar zijn/i)).toBeInTheDocument();
    expect(cta()).toBeInTheDocument();                              // still on the first step
  });

  it('the booker\'s date of birth is required', async () => {
    const user = userEvent.setup();
    renderCheckout();
    fillStepOne({ contact: { dateOfBirth: '' } });
    await user.click(cta());
    expect(await screen.findByText(/geboortedatum van de hoofdboeker is verplicht/i)).toBeInTheDocument();
  });

  it('an adult booker with a child traveller goes on', async () => {
    const user = userEvent.setup();
    renderCheckout();
    fillStepOne({ contact: { dateOfBirth: yearsAgo(18) }, travellers: [{}, { dob: yearsAgo(10) }] });
    await user.click(cta());
    expect(screen.queryByText(/hoofdboeker moet minstens 18 jaar zijn/i)).toBeNull();
  });
});
