import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';
import { fillContact, fillTraveller, acceptConditions } from '../../test/checkoutForm';

// The extras step sells three things on top of the fare, and each has a rule that matters
// more than its layout:
//
//   Baggage   — what the FARE already carries is stated, never sold. The allowance comes from
//               the supplier (Airtuerk sends kilos and piece counts); only the legs with none
//               offer anything, at SunSky's own price.
//   Cancellation cover — one decision for the booking: if one traveller cancels the holiday,
//               the holiday is cancelled.
//   Travel cover — one decision PER TRAVELLER, because it insures a person, and the booking
//               must be charged for exactly the ones who took it.

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

// A fare with a cabin bag but NO hold allowance: exactly the case where one row states
// "Included" and the other has something to sell.
const bookingWith = (baggage) => ({
  hotelCode: '300984', hotelName: 'Test Hotel', stars: 4, loc: 'Alanya, Türkiye', img: '',
  board: 'All inclusive', nights: 7, adults: 2, currency: '€',
  ppPrice: 300, dateLabel: '7 Sep — 14 Sep', room: 'Double Room', roomExtra: 0,
  search: {
    destination: 'AYT', origin: 'BRU', transport: 'hotel_only',   // no transfer call in this test
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
      baggage,
    },
  },
});

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false, user: null }, reducers: {} });
const renderCheckout = (booking) => render(
  <Provider store={configureStore({ reducer: { auth: auth.reducer } })}>
    <MemoryRouter initialEntries={[{ pathname: '/checkout', state: { booking } }]}>
      <Routes><Route path="/checkout" element={<Checkout />} /></Routes>
    </MemoryRouter>
  </Provider>
);

const toExtras = async (user) => {
  fillContact();
  fillTraveller(0, { firstName: 'Ali', lastName: 'Benli', dob: '1990-01-01' });
  fillTraveller(1, { firstName: 'Aylin', lastName: 'Benli', dob: '1992-05-05', gender: 'FEMALE' });
  await user.click(screen.getByRole('button', { name: /continue to add-ons/i }));
  await waitFor(() => expect(document.querySelector('.ck-modal')).toBeTruthy());
  for (const tick of document.querySelectorAll('.ck-modal .ck-check')) await user.click(tick);
  await user.click(document.querySelector('.ck-rv-confirm'));
  await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/add-ons/i));
};

/** The card whose title matches, so sections that share row styling stay apart. */
const card = (title) => [...document.querySelectorAll('.ck-card')]
  .find((c) => new RegExp(title, 'i').test(c.querySelector('.ck-bagkind-text b')?.textContent || ''));
const sumRow = (label) => [...document.querySelectorAll('.ck-sum-row')]
  .find((r) => new RegExp(label, 'i').test(r.textContent));

beforeEach(() => {
  post.mockReset();
  post.mockImplementation(() => Promise.resolve({ data: {} }));
});

describe('baggage on the extras step', () => {
  it('states what the fare carries and only sells the legs that carry nothing', async () => {
    const user = userEvent.setup();
    // 20 kg in the hold, a cabin bag, both directions (the supplier merges a return by MIN).
    renderCheckout(bookingWith({ checkedKg: 20, checkedPieces: 0, handKg: 8, infantKg: 0 }));
    await toExtras(user);

    const checked = card('Checked baggage');
    expect(checked).toBeTruthy();
    // Two travellers × two directions, every one of them already covered by the fare — stated,
    // never sold twice. A second bag is still offered, because carrying one does not mean
    // nobody wants another.
    const rows = [...checked.querySelectorAll('.ck-bagrow')];
    expect(rows).toHaveLength(4);
    rows.forEach((r) => expect(r).toHaveTextContent('Included · 20 kg'));
    expect(checked.querySelectorAll('.ck-bag-select')).toHaveLength(4);

    // The client's rule: a fare with hold baggage carries a cabin bag too. The supplier
    // reports handLuggage as 0 on every option, so reading it literally would offer to sell
    // a bag the ticket already includes.
    const cabin = card('Cabin baggage');
    [...cabin.querySelectorAll('.ck-bagrow')].forEach((r) => expect(r).toHaveTextContent(/included/i));
    expect([...cabin.querySelectorAll('.ck-bag-add')].map((b) => b.textContent))
      .toEqual(expect.arrayContaining([expect.stringMatching(/another cabin bag/i)]));
  });

  it('follows the checked allowance for the cabin bag, even when the airline reports none', async () => {
    const user = userEvent.setup();
    // 20 kg in the hold, handLuggage 0 — exactly what Airtuerk sends on a fare that does
    // include a cabin bag.
    renderCheckout(bookingWith({ checkedKg: 20, checkedPieces: 0, handKg: 0, infantKg: 0 }));
    await toExtras(user);

    const cabin = card('Cabin baggage');
    [...cabin.querySelectorAll('.ck-bagrow')].forEach((r) => {
      expect(r).toHaveTextContent(/included/i);
      expect(r).not.toHaveTextContent(/not included/i);
    });
  });

  it('says the allowance is unknown when the airline sent none at all', async () => {
    const user = userEvent.setup();
    renderCheckout(bookingWith(null));      // no baggage object on the fare
    await toExtras(user);

    // Not "Not included" — that is a claim about the ticket we have no basis for. The bag is
    // still offered, which is the right thing to do when nobody has told us otherwise.
    const cabin = card('Cabin baggage');
    expect(cabin).toHaveTextContent(/not confirmed/i);
    expect(cabin.querySelectorAll('.ck-bag-add').length).toBeGreaterThan(0);
  });

  it('charges an added bag once, for the traveller and leg it was added to', async () => {
    const user = userEvent.setup();
    // A fare with NO hold allowance: every leg has something to sell.
    renderCheckout(bookingWith({ checkedKg: 0, checkedPieces: 0, handKg: 8, infantKg: 0 }));
    await toExtras(user);

    const checked = card('Checked baggage');
    const selects = [...checked.querySelectorAll('.ck-bag-select')];
    expect(selects).toHaveLength(4);                 // 2 travellers × outbound + return

    // Traveller 1's return leg: 20 kg at €35 from the dashboard's table. The breakdown names
    // the bag rather than saying "Baggage": two different bags at the same price are
    // indistinguishable otherwise, and the traveller is checking what they are paying for.
    await user.selectOptions(selects[1], '20');
    await waitFor(() => expect(sumRow('checked baggage 20 kg')).toBeTruthy());
    expect(sumRow('checked baggage 20 kg')).toHaveTextContent('€35');

    // A second, DIFFERENT bag is its own line — not merged into a count.
    await user.selectOptions(selects[2], '15');
    await waitFor(() => expect(sumRow('checked baggage 15 kg')).toBeTruthy());
    expect(sumRow('checked baggage 15 kg')).toHaveTextContent('€25');
    expect(sumRow('checked baggage 20 kg')).toHaveTextContent('€35');
  });

  it('keeps the same bag on one line, with a count', async () => {
    const user = userEvent.setup();
    renderCheckout(bookingWith({ checkedKg: 0, checkedPieces: 0, handKg: 8, infantKg: 0 }));
    await toExtras(user);

    const selects = [...card('Checked baggage').querySelectorAll('.ck-bag-select')];
    // The SAME bag twice — outbound and return of traveller 1.
    await user.selectOptions(selects[0], '20');
    await user.selectOptions(selects[1], '20');

    await waitFor(() => expect(sumRow('checked baggage 20 kg')).toHaveTextContent('× 2'));
    expect(sumRow('checked baggage 20 kg')).toHaveTextContent('€70');
  });
});

describe('the two insurance decisions', () => {
  it('sends cancellation for the party and travel cover only for those who took it', async () => {
    const user = userEvent.setup();
    renderCheckout(bookingWith({ checkedKg: 20, checkedPieces: 0, handKg: 8, infantKg: 0 }));
    await toExtras(user);

    // Cancellation: one choice for the booking.
    const cancel = card('Protect your trip');
    expect(cancel).toBeTruthy();
    await user.click([...cancel.querySelectorAll('.ck-tr')][0]);

    // Travel: one card per traveller, and only the first takes it.
    const travel = card('travel insurance');
    const travellerBlocks = [...travel.querySelectorAll('.ck-bagtrav')];
    expect(travellerBlocks).toHaveLength(2);
    await user.click(travellerBlocks[0].querySelectorAll('.ck-tr')[0]);   // yes
    await user.click(travellerBlocks[1].querySelectorAll('.ck-tr')[1]);   // no

    // €4 per traveller per day × 7 days × ONE traveller.
    await waitFor(() => expect(sumRow('travel insurance')).toBeTruthy());
    expect(sumRow('travel insurance')).toHaveTextContent('€28');

    await user.click(screen.getByRole('button', { name: /continue to payment/i }));
    await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/payment/i));
    await user.click(screen.getByRole('button', { name: /bancontact/i }));
    acceptConditions();   // each condition has its own box now
    await user.click(screen.getByRole('button', { name: /^pay /i }));

    await waitFor(() => expect(post.mock.calls.some(([url]) => String(url).includes('online-bookings'))).toBe(true));
    const [, body] = post.mock.calls.find(([url]) => String(url).includes('online-bookings'));
    // One line per policy, each with the count it was sold for — the server re-prices from it.
    const travelLine = body.insurances.find((i) => i.type === 'travel');
    const cancelLine = body.insurances.find((i) => i.type === 'cancel');
    expect(travelLine).toMatchObject({ pax: 1, price: 28 });
    expect(cancelLine).toMatchObject({ pax: 2 });
    expect(cancelLine.price).toBeGreaterThan(0);
  });
});
