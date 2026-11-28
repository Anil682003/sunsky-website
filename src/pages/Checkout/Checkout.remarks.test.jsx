import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';
import { fillContact, fillTraveller } from '../../test/checkoutForm';

// The hotel's remarks for the rate being booked (Supplier Remarks Frontend Implementation,
// Levent 20 Nov 2026): in full and open in "Controleer je boeking", directly after the booking
// contact under the next section number; again above the binding conditions on the payment
// step; never in the summary beside it; and a re-priced rate brings its own remarks.

const REMARKS = 'Minimum age 18 years (Adults only).\nCheck-in from 14:00, check-out until 12:00.\n\n'
  + 'Cancellations follow the conditions of the booked rate.';

const BOOKING = {
  hotelCode: '300984', hotelName: 'Test Hotel', stars: 4, loc: 'Alanya, Türkiye', img: '',
  board: 'All inclusive', nights: 7, adults: 2, currency: '€',
  ppPrice: 300, dateLabel: '7 Sep - 14 Sep', flight: null, room: 'Double Room', roomExtra: 0,
  remarks: { rateKey: 'R1', text: REMARKS },
  search: {
    destination: 'AYT', origin: 'BRU', transport: 'hotel_only',
    checkin: '2026-09-07', checkout: '2026-09-14', adults: 2, children: 0, rooms: 1,
  },
  api: { hotel: { hotelCode: '300984', checkin: '2026-09-07', checkout: '2026-09-14', nights: 7, rateKey: 'R1', price: 600, currency: '€', supplier: 'hotelbeds' } },
};

const post = vi.fn();
vi.mock('../../services/axiosInstance', () => {
  const instance = vi.fn(() => Promise.resolve({ data: {} }));
  instance.post = (...a) => post(...a);
  instance.get = vi.fn(() => Promise.resolve({ data: {} }));
  return { default: instance, SUPPLIER_TIMEOUT: 25000 };
});
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false, user: null }, reducers: {} });
const renderCheckout = (booking = BOOKING) => render(
  <Provider store={configureStore({ reducer: { auth: auth.reducer } })}>
    <MemoryRouter initialEntries={[{ pathname: '/checkout', state: { booking } }]}>
      <Routes><Route path="/checkout" element={<Checkout />} /></Routes>
    </MemoryRouter>
  </Provider>,
);

const toReview = async (user) => {
  fillContact();
  [...document.querySelectorAll('.ck-trav')].forEach((card, i) => {
    if (!card.querySelector('.ck-dob-lock')) fillTraveller(i, { firstName: 'Ali', lastName: `Benli${i}`, dob: '1990-01-01' });
  });
  await user.click(screen.getByRole('button', { name: /doorgaan naar extra's/i }));
  await waitFor(() => expect(document.querySelector('.ck-modal')).toBeTruthy());
  for (const tick of document.querySelectorAll('.ck-modal .ck-check')) await user.click(tick);
  await user.click(document.querySelector('.ck-rv-confirm'));
  await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/extra's/i));
  await user.click(screen.getByRole('button', { name: /verder naar overzicht/i }));
  await waitFor(() => expect(document.querySelector('.ck-rv')).toBeTruthy());
};

const reviewHeads = () => [...document.querySelectorAll('.ck-rv .ck-rv-sec')]
  .map((s) => `${s.querySelector('.ck-rv-n')?.textContent} ${s.querySelector('.ck-rv-t, [aria-expanded] span:nth-of-type(3)')?.textContent || ''}`.trim());

beforeEach(() => { post.mockReset(); post.mockResolvedValue({ data: {} }); });

// Levent, 27-28 Nov 2026: no remarks in the cart ("Controleer je boeking"). Hotelbeds rate comments
// (certification 3.9) are shown on the payment step, before final booking; other suppliers' remarks
// stay internal.
describe('the hotel remarks in the checkout', () => {
  it('are not shown in the cart, even when the supplier sent them; no section number spent', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await toReview(user);

    expect(document.querySelector('.ck-rv [data-testid="supplier-remarks"]')).toBeNull();
    const heads = reviewHeads();
    expect(heads.some((h) => /specifieke voorwaarden van het geselecteerde tarief/i.test(h))).toBe(false);
    expect(heads.map((h) => Number(h.split(' ')[0]))).toEqual(heads.map((_, i) => i + 1));
  });

  it('Hotelbeds rate comments are shown on the payment step, above the binding conditions', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await toReview(user);
    await user.click(screen.getByRole('button', { name: /doorgaan naar betaling/i }));
    await waitFor(() => expect(document.querySelector('.ck-terms')).toBeTruthy());

    const box = document.querySelector('.ck-pay-remarks');
    expect(box).toBeTruthy();
    expect(box.textContent).toContain('Cancellations follow the conditions of the booked rate.');
    expect(box.compareDocumentPosition(document.querySelector('.ck-terms')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a W2M rate shows no remarks at all', async () => {
    const user = userEvent.setup();
    renderCheckout({ ...BOOKING, api: { hotel: { ...BOOKING.api.hotel, supplier: 'w2m' } } });
    await toReview(user);
    await user.click(screen.getByRole('button', { name: /doorgaan naar betaling/i }));
    await waitFor(() => expect(document.querySelector('.ck-terms')).toBeTruthy());
    expect(document.querySelector('[data-testid="supplier-remarks"]')).toBeNull();
  });
});
