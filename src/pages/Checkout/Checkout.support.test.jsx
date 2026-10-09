import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';
import { fillContact, fillTraveller } from '../../test/checkoutForm';

/**
 * The Support Package step (Support spec v1.0 §3, §5, §3.1).
 *
 * What is worth protecting here is not the layout but four decisions:
 *
 *   - the default is a PRESELECTION, not a lock (§3.1), so the traveller can pick any level;
 *   - a per-person price is multiplied by the party and a per-booking one is not (§3.1);
 *   - the three statuses read differently, because §5.1 gives them different meanings;
 *   - only the CODE is sent to the server, never a price, so a browser cannot name its own.
 *
 * And one that is easy to regress: a booking with no support product must step straight past
 * the panel rather than showing an empty one.
 */

const post = vi.fn();
const get = vi.fn();
// The default export is CALLED by useApi as well as used as an object, so the mock is both.
vi.mock('../../services/axiosInstance', () => {
  const instance = vi.fn(() => Promise.resolve({ data: {} }));
  instance.post = (...a) => post(...a);
  instance.get = (...a) => get(...a);
  return { default: instance, SUPPLIER_TIMEOUT: 25000 };
});
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const LEVELS = [
  {
    id: 1, code: 'BASIC', title: 'Basic Support', badge: null, description: 'Essential support.',
    sortOrder: 0, price: 0, pricingUnit: 'PER_PERSON', isDefault: true,
    services: [
      { code: 'GENERAL', text: 'General booking support', status: 'INCLUDED', fee: null, feeUnit: null },
      { code: 'CHANGE', text: 'Booking change assistance', status: 'PAID', fee: 39.99, feeUnit: 'PER_REQUEST' },
      { code: 'PRIORITY', text: 'Priority Support', status: 'NOT_INCLUDED', fee: null, feeUnit: null },
    ],
  },
  {
    id: 2, code: 'PREMIUM', title: 'Premium Support', badge: 'Best choice', description: 'Everything included.',
    sortOrder: 1, price: 29.99, pricingUnit: 'PER_PERSON', isDefault: false,
    services: [
      { code: 'GENERAL', text: 'General booking support', status: 'INCLUDED', fee: null, feeUnit: null },
      { code: 'CHANGE', text: 'Booking change assistance', status: 'INCLUDED', fee: null, feeUnit: null },
      { code: 'PRIORITY', text: 'Priority Support', status: 'INCLUDED', fee: null, feeUnit: null },
    ],
  },
];

const booking = (withHotel = true) => ({
  kind: withHotel ? 'hotel' : 'flight',
  hotelCode: withHotel ? '300984' : '', hotelName: withHotel ? 'Test Hotel' : '', stars: 4,
  loc: 'Alanya, Türkiye', img: '', board: 'All inclusive', nights: 7, adults: 2, currency: '€',
  ppPrice: 300, dateLabel: '7 Sep — 14 Sep', room: 'Double Room', roomExtra: 0,
  search: {
    destination: 'AYT', origin: 'BRU', transport: 'hotel_only',
    checkin: '2026-09-07', checkout: '2026-09-14', adults: 2, children: 0, rooms: 1,
  },
  api: {
    ...(withHotel ? { hotel: { hotelCode: '300984', checkin: '2026-09-07', checkout: '2026-09-14', nights: 7, rateKey: 'R1', price: 600, currency: '€' } } : {}),
    flight: {
      from: 'BRU', to: 'AYT', depdate: '2026-09-07', retdate: '2026-09-14', price: 0, tripType: 'roundtrip',
      legs: [
        { from: 'BRU', to: 'AYT', departure: '2026-09-07T09:00:00', arrival: '2026-09-07T13:40:00', airline: 'TB', flightNumber: '4521' },
        { from: 'AYT', to: 'BRU', departure: '2026-09-14T15:00:00', arrival: '2026-09-14T18:10:00', airline: 'TB', flightNumber: '4522' },
      ],
    },
  },
});

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false, user: null }, reducers: {} });
const renderCheckout = (b) => render(
  <Provider store={configureStore({ reducer: { auth: auth.reducer } })}>
    <MemoryRouter initialEntries={[{ pathname: '/checkout', state: { booking: b } }]}>
      <Routes><Route path="/checkout" element={<Checkout />} /></Routes>
    </MemoryRouter>
  </Provider>
);

/** Walk to the support step the way a traveller does. */
const toSupport = async (user) => {
  fillContact();
  fillTraveller(0, { firstName: 'Ali', lastName: 'Benli', dob: '1990-01-01' });
  fillTraveller(1, { firstName: 'Aylin', lastName: 'Benli', dob: '1992-05-05', gender: 'FEMALE' });
  await user.click(screen.getByRole('button', { name: /doorgaan naar extra's/i }));
  await waitFor(() => expect(document.querySelector('.ck-modal')).toBeTruthy());
  for (const tick of document.querySelectorAll('.ck-modal .ck-check')) await user.click(tick);
  await user.click(document.querySelector('.ck-rv-confirm'));
  await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/extra's/i));
  await user.click(screen.getByRole('button', { name: /doorgaan naar supportpakket/i }));
  await waitFor(() => expect(document.querySelector('.ck-sup-grid')).toBeTruthy());
};

const cards = () => [...document.querySelectorAll('.ck-sup-card')];
const cardFor = (title) => cards().find((c) => new RegExp(title, 'i').test(c.textContent));
const sumRow = (label) => [...document.querySelectorAll('.ck-sum-row')]
  .find((r) => new RegExp(label, 'i').test(r.textContent));

beforeEach(() => {
  post.mockReset();
  post.mockImplementation(() => Promise.resolve({ data: {} }));
  get.mockReset();
  get.mockImplementation((url) =>
    (String(url).includes('/website/support-packages')
      ? Promise.resolve({ data: { data: { productType: 'FLIGHT_HOTEL', items: LEVELS } } })
      : Promise.resolve({ data: {} })));
});

describe('the support package step', () => {
  it('asks the server for the packages of the product being booked', async () => {
    const user = userEvent.setup();
    renderCheckout(booking(true));
    await toSupport(user);
    const call = get.mock.calls.find(([u]) => String(u).includes('/website/support-packages'));
    expect(call[1].params.product).toBe('FLIGHT_HOTEL');
  });

  it('shows every configured level, with its badge and description', async () => {
    const user = userEvent.setup();
    renderCheckout(booking(true));
    await toSupport(user);
    expect(cards()).toHaveLength(2);
    expect(cardFor('Basic Support')).toHaveTextContent('Essential support.');
    expect(cardFor('Premium Support')).toHaveTextContent('Best choice');
  });

  // §5.1: the three statuses mean different things, so they must not all render as a tick.
  it('distinguishes included, paid and not included', async () => {
    const user = userEvent.setup();
    renderCheckout(booking(true));
    await toSupport(user);
    const basic = cardFor('Basic Support');
    expect(basic.querySelector('.ck-sup-row.included')).toHaveTextContent(/Inbegrepen/i);
    // Rule 10: SUNSKY's own selling prices are shown as whole euros, so a 39.99 fee reads 40.
    expect(basic.querySelector('.ck-sup-row.paid')).toHaveTextContent(/40/);
    expect(basic.querySelector('.ck-sup-row.not_included')).toHaveTextContent(/Niet inbegrepen/i);
  });

  // §3.1: the default is a preselection, and it must not cost anything the traveller has not
  // chosen — the free Basic tier being default is exactly why the summary row stays absent.
  it('preselects the default level and charges nothing for a free one', async () => {
    const user = userEvent.setup();
    renderCheckout(booking(true));
    await toSupport(user);
    expect(cardFor('Basic Support').className).toMatch(/\bact\b/);
    expect(sumRow('Basic Support')).toBeUndefined();
  });

  it('lets the traveller choose a different level than the default', async () => {
    const user = userEvent.setup();
    renderCheckout(booking(true));
    await toSupport(user);
    await user.click(cardFor('Premium Support'));
    await waitFor(() => expect(cardFor('Premium Support').className).toMatch(/\bact\b/));
    expect(cardFor('Basic Support').className).not.toMatch(/\bact\b/);
  });

  // §3.1 pricing unit: 29.99 per person for a party of two. Rule 10 rounds SUNSKY's own
  // selling prices up to whole euros on screen, so 59.98 is shown as 60.
  it('multiplies a per-person package by the party and shows it in the summary', async () => {
    const user = userEvent.setup();
    renderCheckout(booking(true));
    await toSupport(user);
    await user.click(cardFor('Premium Support'));
    await waitFor(() => expect(sumRow('Premium Support')).toBeTruthy());
    expect(sumRow('Premium Support')).toHaveTextContent(/60/);
  });

  it('charges a per-booking package once however many travel', async () => {
    get.mockImplementation((url) =>
      (String(url).includes('/website/support-packages')
        ? Promise.resolve({ data: { data: { items: [{ ...LEVELS[1], pricingUnit: 'PER_BOOKING', isDefault: false }, { ...LEVELS[0] }] } } })
        : Promise.resolve({ data: {} })));
    const user = userEvent.setup();
    renderCheckout(booking(true));
    await toSupport(user);
    await user.click(cardFor('Premium Support'));
    await waitFor(() => expect(sumRow('Premium Support')).toBeTruthy());
    expect(sumRow('Premium Support')).toHaveTextContent(/30/);
  });

  // A flight with no hotel is the other product in scope (§1).
  it('asks for FLIGHT_ONLY when the booking carries no hotel', async () => {
    const user = userEvent.setup();
    renderCheckout(booking(false));
    await toSupport(user);
    const call = get.mock.calls.find(([u]) => String(u).includes('/website/support-packages'));
    expect(call[1].params.product).toBe('FLIGHT_ONLY');
  });

  // A package the traveller could not see is one they have not agreed to buy.
  it('steps past the panel when no packages are configured', async () => {
    get.mockImplementation((url) =>
      (String(url).includes('/website/support-packages')
        ? Promise.resolve({ data: { data: { items: [] } } })
        : Promise.resolve({ data: {} })));
    const user = userEvent.setup();
    renderCheckout(booking(true));
    fillContact();
    fillTraveller(0, { firstName: 'Ali', lastName: 'Benli', dob: '1990-01-01' });
    fillTraveller(1, { firstName: 'Aylin', lastName: 'Benli', dob: '1992-05-05', gender: 'FEMALE' });
    await user.click(screen.getByRole('button', { name: /doorgaan naar extra's/i }));
    await waitFor(() => expect(document.querySelector('.ck-modal')).toBeTruthy());
    for (const tick of document.querySelectorAll('.ck-modal .ck-check')) await user.click(tick);
    await user.click(document.querySelector('.ck-rv-confirm'));
    await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/extra's/i));
    // The add-ons CTA leads straight to payment, and the stepper never offers the step.
    expect(screen.getByRole('button', { name: /doorgaan naar betaling/i })).toBeTruthy();
    expect([...document.querySelectorAll('.ck-step')].some((s) => /supportpakket/i.test(s.textContent))).toBe(false);
  });

  it('numbers the remaining steps without a gap when the step is skipped', async () => {
    get.mockImplementation((url) =>
      (String(url).includes('/website/support-packages')
        ? Promise.resolve({ data: { data: { items: [] } } })
        : Promise.resolve({ data: {} })));
    renderCheckout(booking(true));
    await waitFor(() => expect(document.querySelectorAll('.ck-step').length).toBe(3));
    const names = [...document.querySelectorAll('.ck-step-name')].map((n) => n.textContent.trim());
    expect(names.map((n) => n[0])).toEqual(['1', '2', '3']);
  });
});
