import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';
import { fillContact, fillTraveller, setDob } from '../../test/checkoutForm';

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

describe('the hotel remarks in the checkout', () => {
  it('follow the booking contact in "Controleer je boeking", numbered next, open and in full', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await toReview(user);

    const heads = reviewHeads();
    const contact = heads.findIndex((h) => /contactgegevens boeking/i.test(h));
    expect(heads[contact + 1]).toMatch(/belangrijke informatie van het hotel/i);
    // Numbered straight after the contact, with no gaps for sections that are absent.
    expect(heads.map((h) => Number(h.split(' ')[0]))).toEqual(heads.map((_, i) => i + 1));

    const box = document.querySelector('.ck-rv [data-testid="supplier-remarks"]');
    expect(box.querySelector('[aria-expanded]')).toHaveAttribute('aria-expanded', 'true');
    expect([...box.querySelectorAll('p')].map((p) => p.textContent).join('\n\n')).toBe(REMARKS);
    expect(box.textContent).not.toMatch(/punten|toon alle/i);
    // Not repeated in the summary beside it.
    expect(document.querySelector('.ck-aside [data-testid="supplier-remarks"]')).toBeNull();
    // Verified on the hotel page: the checkout asks no supplier for them.
    expect(post.mock.calls.filter(([url]) => String(url).includes('checkrate'))).toHaveLength(0);
  });

  it('stay in reach on the payment step, above the conditions that make the booking binding', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await toReview(user);
    await user.click(screen.getByRole('button', { name: /doorgaan naar betaling/i }));
    await waitFor(() => expect(document.querySelector('.ck-cond')).toBeTruthy());

    const box = document.querySelector('[data-testid="supplier-remarks"]');
    expect(box).toBeTruthy();
    expect(box.textContent).toContain('Cancellations follow the conditions of the booked rate.');
    expect(box.compareDocumentPosition(document.querySelector('.ck-cond')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('are absent, with no section number spent, when the supplier sent none', async () => {
    const user = userEvent.setup();
    renderCheckout({ ...BOOKING, remarks: null });
    await toReview(user);

    expect(document.querySelector('[data-testid="supplier-remarks"]')).toBeNull();
    const heads = reviewHeads();
    expect(heads.map((h) => Number(h.split(' ')[0]))).toEqual(heads.map((_, i) => i + 1));
  });

  it('a re-priced rate brings its own remarks from the rate check', async () => {
    const user = userEvent.setup();
    const CHILD = {
      ...BOOKING,
      adults: 3,
      search: { ...BOOKING.search, adults: 2, children: 1, childAges: '10', childDobs: '2016-09-07', roomCode: 'DBL', boardCode: 'AI' },
      api: { hotel: { ...BOOKING.api.hotel, roomCode: 'DBL', boardCode: 'AI' } },
    };
    post.mockImplementation((url, body) => {
      if (String(url).includes('checkrate')) {
        return Promise.resolve({ data: { success: true, rateComments: `Remarks for ${body.rateKey}.` } });
      }
      if (String(url).includes('hotel-availability/search')) {
        return Promise.resolve({ data: { results: { hotelbeds: { rooms: [{
          roomName: 'Double Room', roomCode: 'DBL', boardName: 'All Inclusive', boardCode: 'AI',
          sellingRate: 600, currency: 'EUR', rateKey: 'R2', cancellationPolicies: [],
        }] } } } });
      }
      return Promise.resolve({ data: {} });
    });
    renderCheckout(CHILD);
    await waitFor(() => expect(document.querySelectorAll('.ck-dob-lock')).toHaveLength(1));

    // The child turns out to be 13: a different party, so the supplier is asked again.
    await user.click(screen.getByRole('button', { name: /^wijzigen$/i }));
    await user.click(screen.getByRole('button', { name: /geboortedatum wijzigen/i }));
    expect(setDob([...document.querySelectorAll('.ck-trav')][2], '2013-09-07')).toBe(true);
    await waitFor(() => expect(post.mock.calls.some(([url, b]) => String(url).includes('checkrate') && b.rateKey === 'R2')).toBe(true), { timeout: 3000 });
    await waitFor(() => expect(document.querySelector('.ck-rp')).toHaveTextContent(/opnieuw gecontroleerd|ongewijzigd|zelfde/i), { timeout: 3000 });

    await toReview(user);
    const box = document.querySelector('.ck-rv [data-testid="supplier-remarks"]');
    expect(box).toHaveTextContent('Remarks for R2.');
    expect(box).not.toHaveTextContent('Minimum age 18');
  });
});
