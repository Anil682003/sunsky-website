import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';

// A misspelled traveller name is the one checkout mistake the customer pays for after the
// fact — airlines charge to correct one and some refuse outright. So the way out of step 1
// is a modal that shows each name and date of birth back as we will send them, one tick per
// traveller, and nothing advances until every tick is set.
//
// The tick is a statement about a SPECIFIC spelling: editing a name, title or date of birth
// drops that traveller's confirmation, and the stepper shortcut lands on the same gate
// rather than sliding past it.

const BOOKING = {
  hotelCode: '300984', hotelName: 'Test Hotel', stars: 4, loc: 'Alanya, Türkiye', img: '',
  board: 'All inclusive', nights: 7, adults: 2, currency: '€',
  ppPrice: 192, dateLabel: '7 Sep — 14 Sep', flight: null, room: 'Double Room', roomExtra: 0, meal: 'All inclusive',
  api: { hotel: { hotelCode: '300984', price: 384, currency: '€' } },
};

vi.mock('../../services/axiosInstance', () => ({
  default: { post: vi.fn(() => Promise.resolve({ data: {} })), get: vi.fn(() => Promise.resolve({ data: {} })) },
  SUPPLIER_TIMEOUT: 25000,
}));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false, user: null }, reducers: {} });
const makeStore = () => configureStore({ reducer: { auth: auth.reducer } });

const renderCheckout = () => render(
  <Provider store={makeStore()}>
    <MemoryRouter initialEntries={[{ pathname: '/checkout', state: { booking: BOOKING } }]}>
      <Routes><Route path="/checkout" element={<Checkout />} /></Routes>
    </MemoryRouter>
  </Provider>
);

// The step-1 form, filled just enough to pass validation.
const fillStepOne = async (user, { lastNames = ['Benli', 'Vanli'] } = {}) => {
  const fields = [...document.querySelectorAll('.ck-field')];
  const input = (i) => fields[i].querySelector('input, select');
  const type = async (i, v) => { await user.clear(input(i)); await user.type(input(i), v); };
  const pick = async (i) => user.selectOptions(input(i), input(i).options[1].value);

  await type(0, 'Ali');                    // customer first name
  await type(1, lastNames[0]);             // customer last name
  await pick(4);                           // nationality
  await type(6, 'ali@example.com');        // email
  await type(7, '+32475123456');           // phone

  await type(15, 'Ali'); await type(16, lastNames[0]);        // traveller 1
  await pick(18); await type(19, '1995-11-19');
  await type(23, 'Ilhan'); await type(24, lastNames[1]);      // traveller 2
  await pick(26); await type(27, '2009-02-16');
};

const modal = () => document.querySelector('.ck-modal');
const activeStep = () => document.querySelector('.ck-step.act')?.textContent || '';
const confirmBtn = () => document.querySelector('.ck-rv-confirm');

beforeEach(() => { document.body.style.overflow = ''; });

describe('the name check between details and extras', () => {
  it('will not leave step 1 until every traveller is ticked', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await fillStepOne(user);

    await user.click(screen.getByRole('button', { name: /continue to add-ons/i }));

    // The modal opens instead of the step advancing.
    await waitFor(() => expect(modal()).toBeTruthy());
    expect(activeStep()).toMatch(/your details/i);

    // Each traveller is named back with a day-first date of birth.
    const names = [...modal().querySelectorAll('.ck-rv-name')].map((n) => n.textContent);
    expect(names[0]).toContain('Ali Benli');
    expect(names[0]).toContain('19/11/1995');
    expect(names[1]).toContain('Ilhan Vanli');
    expect(names[1]).toContain('16/02/2009');

    // Confirming is refused while a tick is missing, and says what is missing.
    expect(confirmBtn()).toBeDisabled();
    expect(confirmBtn()).toHaveTextContent(/tick every traveller/i);
    const boxes = [...modal().querySelectorAll('.ck-check')];   // the label — the input itself is visually hidden
    await user.click(boxes[0]);
    expect(confirmBtn()).toBeDisabled();

    await user.click(boxes[1]);
    await waitFor(() => expect(confirmBtn()).toBeEnabled());
    await user.click(confirmBtn());

    await waitFor(() => expect(modal()).toBeFalsy());
    expect(activeStep()).toMatch(/add-ons/i);
  });

  it('drops a traveller\'s confirmation when their name changes', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await fillStepOne(user);
    await user.click(screen.getByRole('button', { name: /continue to add-ons/i }));
    await waitFor(() => expect(modal()).toBeTruthy());

    const boxes = [...modal().querySelectorAll('.ck-check')];   // the label — the input itself is visually hidden
    await user.click(boxes[0]); await user.click(boxes[1]);
    await user.click(confirmBtn());
    await waitFor(() => expect(activeStep()).toMatch(/add-ons/i));

    // Back to the form to fix a surname…
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    await waitFor(() => expect(activeStep()).toMatch(/your details/i));
    const lastName = [...document.querySelectorAll('.ck-field')][24].querySelector('input');
    await user.type(lastName, 'i');   // "Vanli" → "Vanlii"

    // …and the shortcut back to a step already reached lands on the gate, not past it.
    await user.click(screen.getByRole('button', { name: /2\. Add-ons/i }));
    await waitFor(() => expect(modal()).toBeTruthy());
    expect(activeStep()).toMatch(/your details/i);

    const ticks = [...modal().querySelectorAll('.ck-check')].map((c) => c.className.includes('on'));
    expect(ticks).toEqual([true, false]);           // only the edited traveller lost their tick
    expect(within(modal()).getByText(/Vanlii/)).toBeInTheDocument();
    expect(confirmBtn()).toBeDisabled();
  });
});
