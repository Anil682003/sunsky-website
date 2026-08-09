import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';

// The airport transfer is bought here, in the extras step, and no longer on the hotel page.
// By this point the flight is fixed, so the pickup can be timed to the arrival that will
// actually be booked — which is what the supplier's rateKey encodes.
//
// It is opt-in: "No transfer" is the state a booking starts in, because an extra that arrives
// pre-selected is a charge nobody agreed to.

const post = vi.fn();
vi.mock('../../services/axiosInstance', () => ({
  default: { post: (...a) => post(...a), get: vi.fn(() => Promise.resolve({ data: {} })) },
  SUPPLIER_TIMEOUT: 25000,
}));
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
  const fields = [...document.querySelectorAll('.ck-field')];
  const input = (i) => fields[i].querySelector('input, select');
  await user.type(input(0), 'Ali'); await user.type(input(1), 'Benli');
  await user.selectOptions(input(4), input(4).options[1].value);
  await user.type(input(6), 'ali@example.com'); await user.type(input(7), '+32475123456');
  await user.type(input(15), 'Ali'); await user.type(input(16), 'Benli');
  await user.selectOptions(input(18), input(18).options[1].value); await user.type(input(19), '1990-01-01');
  await user.type(input(23), 'Aylin'); await user.type(input(24), 'Benli');
  await user.selectOptions(input(26), input(26).options[1].value); await user.type(input(27), '1992-05-05');

  await user.click(screen.getByRole('button', { name: /continue to add-ons/i }));
  await waitFor(() => expect(document.querySelector('.ck-modal')).toBeTruthy());
  for (const tick of document.querySelectorAll('.ck-modal .ck-check')) await user.click(tick);
  await user.click(document.querySelector('.ck-rv-confirm'));
  await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/add-ons/i));
};

const transferCall = () => post.mock.calls.find(([url]) => String(url).includes('transfer-availability'));

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
    await waitFor(() => expect(document.querySelectorAll('.ck-tr').length).toBe(3));  // 2 + "No transfer"

    // Opt-in: the booking starts with no transfer and no transfer line in the summary.
    expect(document.querySelector('.ck-tr.act')).toHaveTextContent(/no transfer/i);
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
    await waitFor(() => expect(document.querySelectorAll('.ck-tr').length).toBe(3));
    await user.click(screen.getByRole('button', { name: /sedan/i }));

    await user.click(screen.getByRole('button', { name: /continue to payment/i }));
    await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/payment/i));
    await user.click(screen.getByRole('button', { name: /bancontact/i }));
    await user.click([...document.querySelectorAll('.ck-check')].find((el) => /booking conditions/i.test(el.textContent)));
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
