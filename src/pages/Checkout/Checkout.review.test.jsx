import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';
import { fillContact, fillTraveller, fieldByLabel } from '../../test/checkoutForm';

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

// The default export is CALLED as a function by useApi (an axios instance is callable) as
// well as used as an object, so the mock has to be both — otherwise the checkout's config
// fetch throws an unhandled rejection that has nothing to do with the test.
vi.mock('../../services/axiosInstance', () => {
  const instance = vi.fn(() => Promise.resolve({ data: {} }));
  instance.post = vi.fn(() => Promise.resolve({ data: {} }));
  instance.get = vi.fn(() => Promise.resolve({ data: {} }));
  return { default: instance, SUPPLIER_TIMEOUT: 25000 };
});
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

// The step-1 form, filled just enough to pass validation — by label, via the shared helper,
// so a field moving does not break a test about the name check.
const fillForm = ({ lastNames = ['Benli', 'Vanli'] } = {}) => {
  fillContact({ lastName: lastNames[0] });
  fillTraveller(0, { firstName: 'Ali', lastName: lastNames[0], dob: '1995-11-19' });
  fillTraveller(1, { firstName: 'Ilhan', lastName: lastNames[1], dob: '2009-02-16' });
};

const modal = () => document.querySelector('.ck-modal');
const activeStep = () => document.querySelector('.ck-step.act')?.textContent || '';
const confirmBtn = () => document.querySelector('.ck-rv-confirm');

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

beforeEach(() => { document.body.style.overflow = ''; });

describe('the name check between details and extras', () => {
  it('will not leave step 1 until every traveller is ticked', async () => {
    const user = userEvent.setup();
    renderCheckout();
    fillForm();

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
    fillForm();
    await user.click(screen.getByRole('button', { name: /continue to add-ons/i }));
    await waitFor(() => expect(modal()).toBeTruthy());

    const boxes = [...modal().querySelectorAll('.ck-check')];   // the label — the input itself is visually hidden
    await user.click(boxes[0]); await user.click(boxes[1]);
    await user.click(confirmBtn());
    await waitFor(() => expect(activeStep()).toMatch(/add-ons/i));

    // Back to the form to fix a surname…
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    await waitFor(() => expect(activeStep()).toMatch(/your details/i));
    const travCard = [...document.querySelectorAll('.ck-trav')][1];
    const lastName = fieldByLabel('last name', travCard).querySelector('input');
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
