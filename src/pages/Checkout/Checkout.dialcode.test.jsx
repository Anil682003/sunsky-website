import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';
import { contactFields, fieldByLabel, fill } from '../../test/checkoutForm';

// The address country is asked for immediately above the phone number, so by the time the
// traveller reaches the phone box we already know where they are and can start the field
// off with that dialling code.
//
// The whole risk of a convenience like this is that it OVERWRITES something. Living in
// Belgium says nothing about which number a person answers on — plenty of people give a
// foreign mobile — so these tests pin the rule that matters: prefill only ever fills a box
// that is empty or still holds nothing but a code we put there.

const BOOKING = {
  // A photo is present ON PURPOSE: the name only ever disappeared behind a real <img>, so a
  // fixture without one cannot reproduce the bug this file guards.
  hotelCode: '300984', hotelName: 'Test Hotel', stars: 4, loc: 'Alanya, Türkiye',
  img: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
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

const phone = () => fieldByLabel('phone number', contactFields()).querySelector('input');

describe('the summary names the hotel', () => {
  // It always rendered, but the photo carried z-index:1 while the caption was left on
  // `auto`, so the picture painted over the name on every booking that HAD a photo. The
  // name is the one thing on that card identifying what is being paid for.
  it('shows the hotel, its stars and its location above the photo', () => {
    renderCheckout();
    const aside = document.querySelector('.ck-aside');
    expect(aside.querySelector('.ck-sum-name').textContent).toBe('Test Hotel');
    expect(aside.querySelector('.ck-sum-loc').textContent).toContain('Alanya, Türkiye');
    expect(aside.querySelector('.ck-sum-stars').textContent).toBe('★★★★');

    // The caption and its scrim must both out-rank the photo, or the name disappears
    // behind it again.
    const z = (sel) => Number(getComputedStyle(aside.querySelector(sel)).zIndex);
    expect(z('.ck-sum-imgtxt')).toBeGreaterThan(z('.ck-sum-img img'));
    expect(z('.ck-sum-imgov')).toBeGreaterThan(z('.ck-sum-img img'));
  });
});

describe('the phone number starts from the address country', () => {
  it('fills the dialling code once a country is picked', async () => {
    renderCheckout();
    expect(phone()).toHaveValue('');

    fill('country', 'Belgium', contactFields());
    expect(phone()).toHaveValue('+32 ');
  });

  it('follows a change of mind while only the code is there', async () => {
    renderCheckout();
    fill('country', 'Belgium', contactFields());
    fill('country', 'Turkey', contactFields());
    expect(phone()).toHaveValue('+90 ');
  });

  it('never overwrites a number the traveller has typed', async () => {
    const user = userEvent.setup();
    renderCheckout();

    fill('country', 'Belgium', contactFields());
    await user.clear(phone());
    await user.type(phone(), '+44 7700 900123');      // a UK mobile on a Belgian address

    fill('country', 'Netherlands', contactFields());
    expect(phone()).toHaveValue('+44 7700 900123');
  });

  it('leaves the field alone for a country it cannot place', async () => {
    renderCheckout();
    fill('country', 'Other', contactFields());        // "Other" names no single country
    expect(phone()).toHaveValue('');
  });

  it('keeps the field editable — the code is a starting point, not a prefix', async () => {
    const user = userEvent.setup();
    renderCheckout();

    fill('country', 'Belgium', contactFields());
    expect(phone()).not.toHaveAttribute('readonly');
    expect(phone()).toBeEnabled();

    await user.type(phone(), '475 12 34 56');
    expect(phone()).toHaveValue('+32 475 12 34 56');
  });
});
