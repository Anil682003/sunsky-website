import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';
import { setDob } from '../../test/checkoutForm';

// UI-09 (Ch 3 §4): the mandatory local costs the hotel page handed over sit under the summary's
// total, to the cent, and are never part of it. They belong to the RATE, so a re-priced room
// brings its own.

const CHECK_IN = '2026-09-07';
const CHECK_OUT = '2026-09-14';
const KNOWN = { kind: 'known', amount: 12.4, currency: 'EUR' };

const booking = (over = {}) => ({
  hotelCode: '300984', hotelName: 'Test Hotel', stars: 4, loc: 'Alanya, Türkiye', img: '',
  board: 'All inclusive', nights: 7, adults: 2, currency: '€',
  ppPrice: 300, dateLabel: '7 Sep - 14 Sep', room: 'Family Room', roomExtra: 0,
  localCost: KNOWN,
  search: {
    destination: 'AYT', origin: 'BRU', transport: 'hotel_only',
    checkin: CHECK_IN, checkout: CHECK_OUT, nights: 7,
    adults: 2, children: 0, rooms: 1, roomCode: 'FAM.ST', boardCode: 'AI',
  },
  api: {
    hotel: {
      hotelCode: '300984', checkin: CHECK_IN, checkout: CHECK_OUT, nights: 7,
      rateKey: 'RATE-600', roomCode: 'FAM.ST', boardCode: 'AI',
      price: 600, currency: '€', supplier: 'hotelbeds',
    },
  },
  ...over,
});

const post = vi.fn();
vi.mock('../../services/axiosInstance', () => {
  const instance = vi.fn(() => Promise.resolve({ data: {} }));
  instance.post = (...a) => post(...a);
  instance.get = vi.fn(() => Promise.resolve({ data: {} }));
  return { default: instance, SUPPLIER_TIMEOUT: 25000 };
});
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false, user: null }, reducers: {} });
const renderCheckout = (b) => render(
  <Provider store={configureStore({ reducer: { auth: auth.reducer } })}>
    <MemoryRouter initialEntries={[{ pathname: '/checkout', state: { booking: b } }]}>
      <Routes><Route path="/checkout" element={<Checkout />} /></Routes>
    </MemoryRouter>
  </Provider>
);
const local = () => document.querySelector('.ck-sum-local');
const total = () => document.querySelector('.ck-sum-total-val')?.textContent;

beforeEach(() => { post.mockReset(); post.mockResolvedValue({ data: {} }); });

describe('the summary under the total', () => {
  it('a known €12.40 shows as € 12,40 and the total stays €600', async () => {
    renderCheckout(booking());
    await waitFor(() => expect(total()).toBe('€600'));
    expect(local().textContent).toBe('Verplicht ter plaatse te betalen: € 12,40');
    // Right under the total, before anything else in the summary.
    expect(document.querySelector('.ck-sum-total').nextElementSibling).toBe(local());
    expect(document.querySelector('.ck-mbar-price').textContent).toMatch(/€600$/);
    expect(document.body.textContent).not.toMatch(/612/);
  });

  it('nothing handed over: nothing shown, never € 0', async () => {
    renderCheckout(booking({ localCost: null }));
    await waitFor(() => expect(total()).toBe('€600'));
    expect(local()).toBeNull();
    expect(document.body.textContent).not.toMatch(/ter plaatse te betalen|€ 0,00/i);
  });
});

describe('a re-priced rate brings its own local costs', () => {
  // Priced for a 10-year-old; the date typed makes them 30, so the supplier is asked again.
  const childBooking = () => booking({
    adults: 2,
    search: { ...booking().search, adults: 1, children: 1, childAges: '10', childDobs: '' },
  });
  const rate = (price, taxes) => ({
    data: { results: { hotelbeds: { rooms: [{
      roomName: 'Family Room', roomCode: 'FAM.ST', boardName: 'All Inclusive', boardCode: 'AI',
      sellingRate: price, currency: 'EUR', rateKey: `RATE-${price}`, cancellationPolicies: [], ...(taxes ? { taxes } : {}),
    }] } } },
  });
  const childCard = () => [...document.querySelectorAll('.ck-trav')][1];

  it('the accepted room\'s € 15,60 replaces the € 12,40, and the new total is the room alone', async () => {
    post.mockImplementation((url) => (String(url).includes('hotel-availability')
      ? Promise.resolve(rate(980, { allIncluded: false, taxes: [{ included: false, amount: '15.60', currency: 'EUR', clientAmount: '15.60', clientCurrency: 'EUR', type: 'TAXESANDFEES' }] }))
      : Promise.resolve({ data: {} })));
    const user = userEvent.setup();
    renderCheckout(childBooking());
    await waitFor(() => expect(childCard()).toBeTruthy());
    expect(local().textContent).toBe('Verplicht ter plaatse te betalen: € 12,40');
    setDob(childCard(), '1996-01-01');
    await user.click(await screen.findByRole('button', { name: /nieuwe prijs accepteren/i }, { timeout: 4000 }));
    await waitFor(() => expect(local().textContent).toBe('Verplicht ter plaatse te betalen: € 15,60'));
    await waitFor(() => expect(total()).toBe('€980'));
  });

  it('a re-priced room without taxes drops the line rather than keeping the old one', async () => {
    post.mockImplementation((url) => (String(url).includes('hotel-availability')
      ? Promise.resolve(rate(980))
      : Promise.resolve({ data: {} })));
    const user = userEvent.setup();
    renderCheckout(childBooking());
    await waitFor(() => expect(childCard()).toBeTruthy());
    setDob(childCard(), '1996-01-01');
    await user.click(await screen.findByRole('button', { name: /nieuwe prijs accepteren/i }, { timeout: 4000 }));
    await waitFor(() => expect(local()).toBeNull());
  });
});
