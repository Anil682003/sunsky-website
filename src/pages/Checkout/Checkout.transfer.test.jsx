import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';
import { fillContact, fillTraveller } from '../../test/checkoutForm';

// The airport transfer is bought here, in the extras step, and no longer on the hotel page.
// By this point the flight is fixed, so the pickup can be timed to the arrival that will
// actually be booked — which is what the supplier's rateKey encodes.
//
// It is opt-in: "No transfer" is the state a booking starts in, because an extra that arrives
// pre-selected is a charge nobody agreed to.

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

const BOOKING = {
  hotelCode: '300984', hotelName: 'Test Hotel', stars: 4, loc: 'Alanya, Türkiye', img: '',
  board: 'All inclusive', nights: 7, adults: 2, currency: '€',
  ppPrice: 300, dateLabel: '7 Sep — 14 Sep', room: 'Double Room', roomExtra: 0,
  search: {
    destination: 'AYT', origin: 'BRU', transport: 'package',
    checkin: '2026-09-07', checkout: '2026-09-14', adults: 2, children: 0, rooms: 1,
  },
  api: {
    hotel: { hotelCode: '300984', checkin: '2026-09-07', checkout: '2026-09-14', nights: 7, rateKey: 'R1', price: 600, currency: '€' },
    flight: {
      from: 'BRU', to: 'AYT', depdate: '2026-09-07', retdate: '2026-09-14', price: 0, tripType: 'roundtrip',
      legs: [
        { from: 'BRU', to: 'AYT', departure: '2026-09-07T09:00:00', arrival: '2026-09-07T13:40:00', airline: 'TB', flightNumber: '4521' },
        { from: 'AYT', to: 'BRU', departure: '2026-09-14T15:00:00', arrival: '2026-09-14T18:10:00', airline: 'TB', flightNumber: '4522' },
      ],
    },
  },
};

const SERVICES = [
  { vehicle: 'Minibus', transferType: 'SHARED', price: 48, rateKey: 'TR-SHARED', vehicleCode: 'MB', maxPax: 8, pickup: { from: 'Antalya Airport', to: 'Test Hotel' } },
  { vehicle: 'Sedan', transferType: 'PRIVATE', price: 115, rateKey: 'TR-PRIVATE', vehicleCode: 'SD', maxPax: 3, pickup: { from: 'Antalya Airport', to: 'Test Hotel' } },
];

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false, user: null }, reducers: {} });
const renderCheckout = () => render(
  <Provider store={configureStore({ reducer: { auth: auth.reducer } })}>
    <MemoryRouter initialEntries={[{ pathname: '/checkout', state: { booking: BOOKING } }]}>
      <Routes><Route path="/checkout" element={<Checkout />} /></Routes>
    </MemoryRouter>
  </Provider>
);

const toExtras = async (user) => {
  fillContact();
  fillTraveller(0, { firstName: 'Ali', lastName: 'Benli', dob: '1990-01-01' });
  fillTraveller(1, { firstName: 'Aylin', lastName: 'Benli', dob: '1992-05-05' });

  await user.click(screen.getByRole('button', { name: /continue to add-ons/i }));
  await waitFor(() => expect(document.querySelector('.ck-modal')).toBeTruthy());
  for (const tick of document.querySelectorAll('.ck-modal .ck-check')) await user.click(tick);
  await user.click(document.querySelector('.ck-rv-confirm'));
  await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/add-ons/i));
};

const transferCall = () => post.mock.calls.find(([url]) => String(url).includes('transfer-availability'));

// The transfer card, by its heading — the insurance sections render the same option rows, so
// a page-wide .ck-tr count would include them.
const transferCard = () => [...document.querySelectorAll('.ck-card')]
  .find((c) => /choose your transfer/i.test(c.querySelector('.ck-card-title')?.textContent || ''));
const transferRows = () => [...(transferCard()?.querySelectorAll('.ck-tr') || [])];

// Filling a form field is not what these tests are about, and user-event types one character
// at a time — across a dozen fields that is most of the test's wall clock. Set the value the
// way React reads it (native setter + input event) and keep user-event for the clicks that
// ARE the behaviour under test.
const fill = (el, value) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

beforeEach(() => {
  post.mockReset();
  post.mockImplementation((url) => {
    if (String(url).includes('transfer-availability')) {
      return Promise.resolve({ data: { results: { hotelbeds: { services: SERVICES } } } });
    }
    return Promise.resolve({ data: {} });
  });
});

describe('the airport transfer, bought at the extras step', () => {
  it('is not fetched until the traveller reaches the extras step', async () => {
    const user = userEvent.setup();
    renderCheckout();
    expect(transferCall()).toBeFalsy();          // nothing asked while filling in names

    await toExtras(user);
    await waitFor(() => expect(transferCall()).toBeTruthy());

    // Asked for the party, at the hotel, timed to the ARRIVAL of the outbound flight.
    expect(transferCall()[1]).toMatchObject({
      fromType: 'IATA', fromCode: 'AYT',
      toType: 'ATLAS', toCode: '300984',
      outbound: '2026-09-07T13:40:00',
      adults: 2,
    });
  });

  it('adds nothing until one is chosen, then prices it per vehicle', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await toExtras(user);
    await waitFor(() => expect(transferRows()).toHaveLength(3));   // 2 offers + "No transfer"

    // Opt-in: the booking starts with no transfer and no transfer line in the summary.
    expect(transferCard().querySelector('.ck-tr.act')).toHaveTextContent(/no transfer/i);
    expect(document.body.textContent).not.toMatch(/airport transfer \(per vehicle\)/i);

    await user.click(screen.getByRole('button', { name: /minibus/i }));
    await waitFor(() => expect(document.body.textContent).toMatch(/airport transfer \(per vehicle\)/i));

    // Per VEHICLE: €48 for the party of two, not €48 each.
    const line = [...document.querySelectorAll('.ck-sum-row')].find((r) => /airport transfer/i.test(r.textContent));
    expect(line).toHaveTextContent('€48');
  });

  it('sends the chosen transfer with the flight it has to meet', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await toExtras(user);
    await waitFor(() => expect(transferRows()).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: /sedan/i }));

    await user.click(screen.getByRole('button', { name: /continue to payment/i }));
    await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/payment/i));
    await user.click(screen.getByRole('button', { name: /bancontact/i }));
    await user.click([...document.querySelectorAll('.ck-check')].find((el) => /i agree to the above conditions/i.test(el.textContent)));
    await user.click(screen.getByRole('button', { name: /^pay /i }));

    await waitFor(() => expect(post.mock.calls.some(([url]) => String(url).includes('online-bookings'))).toBe(true));
    const [, body] = post.mock.calls.find(([url]) => String(url).includes('online-bookings'));
    expect(body.transfer).toMatchObject({
      fromCode: 'AYT', toCode: '300984',
      rateKey: 'TR-PRIVATE', price: 115,
      outbound: '2026-09-07T13:40:00',
      // The driver has to know which plane to meet.
      flightNumber: '4521', companyName: 'TB',
    });
  });
});
