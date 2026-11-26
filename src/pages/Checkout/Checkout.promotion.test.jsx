import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';
import { fillContact, fillTraveller, acceptConditions } from '../../test/checkoutForm';

// Promotions & Discounts (spec v1.2 §5): the checkout shows ONE extra line under the
// promotion's name, the total follows it, a code can be typed in a compact field, and the
// booking request says which promotion the page showed so SUNSKY can refuse a different one.

const post = vi.fn();
vi.mock('../../services/axiosInstance', () => {
  const instance = vi.fn(() => Promise.resolve({ data: {} }));
  instance.post = (...a) => post(...a);
  instance.get = vi.fn(() => Promise.resolve({ data: {} }));
  return { default: instance, SUPPLIER_TIMEOUT: 25000 };
});
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const booking = {
  hotelCode: '300984', hotelName: 'Test Hotel', stars: 4, loc: 'Alanya, Türkiye', img: '',
  board: 'All inclusive', nights: 7, adults: 1, currency: '€',
  ppPrice: 600, dateLabel: '7 Sep - 14 Sep', flight: null, room: 'Double Room', roomExtra: 0,
  search: { adults: 1, children: 0, rooms: 1, checkin: '2027-09-07', checkout: '2027-09-14' },
  api: {
    hotel: {
      hotelCode: '300984', checkin: '2027-09-07', checkout: '2027-09-14', nights: 7,
      rateKey: 'RATE-1', roomCode: 'DBL', boardCode: 'AI', price: 600, cost: 520, currency: '€',
      supplier: 'hotelbeds', cancellation: [{ from: '2099-01-01T00:00:00+02:00', amount: '600.00' }],
    },
  },
};

const AUTO = { promotionId: 3, name: 'Najaarsactie', code: null, amount: 30, eligiblePrice: 600, finalPrice: 570 };
const CODE = { promotionId: 7, name: 'Zomeractie', code: 'ZOMER25', amount: 60, eligiblePrice: 600, finalPrice: 540 };

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false, user: null }, reducers: {} });
const renderCheckout = () => render(
  <Provider store={configureStore({ reducer: { auth: auth.reducer } })}>
    <MemoryRouter initialEntries={[{ pathname: '/checkout', state: { booking } }]}>
      <Routes><Route path="/checkout" element={<Checkout />} /></Routes>
    </MemoryRouter>
  </Provider>
);

const quoteCalls = () => post.mock.calls.filter(([url]) => String(url).includes('/promotions/quote'));
const summary = () => document.querySelector('.ck-sum');
const promoLine = () => summary()?.querySelector('[data-testid="promotion-line"]');
const totalText = () => summary()?.querySelector('.ck-sum-total-val')?.textContent || '';

/** The quote answers: the automatic offer, and ZOMER25 when typed; NOPE does not exist. */
const answer = (body) => {
  if (body?.code === 'ZOMER25') return { applied: CODE, code: { code: 'ZOMER25', status: 'applied', amount: 60 } };
  if (body?.code === 'NOPE') return { applied: AUTO, code: { code: 'NOPE', status: 'rejected', reason: 'unknown_code' } };
  return { applied: AUTO, code: null };
};

beforeEach(() => {
  post.mockReset();
  post.mockImplementation((url, body) => {
    if (String(url).includes('/promotions/quote')) return Promise.resolve({ data: { success: true, data: answer(body) } });
    return Promise.resolve({ data: {} });
  });
});

describe('promotions at checkout', () => {
  it('shows the automatic promotion as one line and the total follows it', async () => {
    renderCheckout();
    await waitFor(() => expect(promoLine()).toBeTruthy());
    expect(promoLine()).toHaveTextContent('Najaarsactie');
    expect(promoLine()).toHaveTextContent('−€ 30,00');
    // The total counts up to its new value.
    await waitFor(() => expect(totalText()).toMatch(/570/));
    // Asked with the travel price and its cost, never with insurance or extras.
    const [, body] = quoteCalls().at(-1);
    expect(body).toMatchObject({ product: 'hotel', hotelCode: '300984', eligiblePrice: 600, eligibleCost: 520, travelDate: '2027-09-07' });
  });

  it('applies a better code, and says why a code is refused', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await waitFor(() => expect(promoLine()).toBeTruthy());

    await user.click(within(summary()).getByRole('button', { name: /promotiecode/i }));
    await user.type(within(summary()).getByLabelText(/promotiecode/i), 'nope');
    await user.click(within(summary()).getByRole('button', { name: /toepassen/i }));
    await waitFor(() => expect(within(summary()).getByRole('alert')).toHaveTextContent(/bestaat niet/i));
    // The refused code changes nothing: the automatic offer stays.
    expect(promoLine()).toHaveTextContent('Najaarsactie');

    const field = within(summary()).getByLabelText(/promotiecode/i);
    await user.clear(field);
    await user.type(field, 'zomer25');
    await user.click(within(summary()).getByRole('button', { name: /toepassen/i }));
    await waitFor(() => expect(promoLine()).toHaveTextContent('Zomeractie'));
    expect(promoLine()).toHaveTextContent('−€ 60,00');
    expect(within(summary()).getByText(/code zomer25 toegepast/i)).toBeInTheDocument();
    await waitFor(() => expect(totalText()).toMatch(/540/));
  });

  it('sends the promotion it showed with the booking, so SUNSKY can refuse a different one', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await waitFor(() => expect(promoLine()).toBeTruthy());
    fillContact();
    fillTraveller(0, { dob: '1995-11-19' });
    await user.click(screen.getByRole('button', { name: /doorgaan naar extra's/i }));
    await waitFor(() => expect(document.querySelector('.ck-modal')).toBeTruthy());
    await user.click(document.querySelector('.ck-modal .ck-check'));
    await user.click(document.querySelector('.ck-rv-confirm'));
    await user.click(await screen.findByRole('button', { name: /verder naar overzicht/i }));
    await user.click(await screen.findByRole('button', { name: /doorgaan naar betaling/i }));
    await user.click(await screen.findByRole('button', { name: /bancontact/i }));
    acceptConditions();
    await user.click(screen.getByRole('button', { name: /^boek en betaal /i }));
    await waitFor(() => expect(post.mock.calls.some(([url]) => String(url).includes('online-bookings'))).toBe(true));
    const [, body] = post.mock.calls.find(([url]) => String(url).includes('online-bookings'));
    expect(body.promotion).toEqual({ promotionId: 3, amount: 30 });
    expect(body.promoCode).toBeUndefined();
  });
});
