import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';
import { contactFields, fieldByLabel, fill } from '../../test/checkoutForm';

// "This traveller is also the lead booker" starts UNticked: traveller 1 and the booker are two
// separate people until the traveller says they're the same one. Ticking it then populates the
// booker from the traveller (or vice versa — whichever side already has an answer wins) and
// keeps the shared identity in step from then on; unticking makes them independent again.
//
// The binding runs in both directions, and the booker's five identity fields must ALWAYS accept
// the cursor. The first version fed them read-only from the traveller card several hundred
// pixels below — the booker card is the first thing on the page, so people met a form whose
// opening fields refused input for no visible reason. A field that cannot be typed into is
// broken, whatever its hint says.
//
// What is NOT shared, ever: the address, phone, email, emergency number and company. Those are
// the booking's contact details, not a traveller's identity, and the traveller card has no
// place to put them.

const BOOKING = {
  hotelCode: '300984', hotelName: 'Test Hotel', stars: 4, loc: 'Alanya, Türkiye', img: '',
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

// The booker's side of a shared field, and traveller 1's side of the same one.
const booker = (label) => fieldByLabel(label, contactFields()).querySelector('input, select');
const travCard = (i = 0) => [...document.querySelectorAll('.ck-trav')][i];
const trav = (label, i = 0) => fieldByLabel(label, travCard(i)).querySelector('input, select');
const tickBox = () => document.querySelector('.ck-leadbook');   // the label — the input is hidden

describe('traveller 1 is also the lead booker', () => {
  it('starts UNticked — the traveller and the booker are separate until the user asks', () => {
    renderCheckout();
    expect(tickBox().querySelector('input[type="checkbox"]')).not.toBeChecked();
  });

  it('keeps the two apart until ticked, then populates the booker onto traveller 1', async () => {
    const user = userEvent.setup();
    renderCheckout();

    // The booker's identity fields ALWAYS accept the cursor (the read-only bug must not return).
    ['first name', 'last name', 'date of birth'].forEach((l) => expect(booker(l)).not.toHaveAttribute('readonly'));
    ['gender', 'nationality'].forEach((l) => expect(booker(l)).toBeEnabled());

    // Unticked: what's typed in the booker does NOT leak into traveller 1.
    await user.type(booker('first name'), 'Ali');
    expect(trav('first name')).toHaveValue('');

    // Tick it: traveller 1 is populated from the booker, and from here both move together.
    await user.click(tickBox());
    expect(trav('first name')).toHaveValue('Ali');

    await user.type(booker('last name'), 'Benli');
    // The surname is stored in capitals — printed on the ticket that way and matched on by the
    // airline — so the VALUE is uppercased, not just its display.
    expect(trav('last name')).toHaveValue('BENLI');
  });

  it('fills the booker from the traveller card too, once linked — either side, same record', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await user.click(tickBox());   // link the two

    await user.type(trav('first name'), 'Ilhan');
    fill('date of birth', '2001-02-16', travCard());
    fill('nationality', 'Turkish', travCard());
    // The radio itself is visually hidden, so it is clicked the way the label does it.
    travCard().querySelectorAll('.ck-radio input[type="radio"]')[1].click();   // Female

    expect(booker('first name')).toHaveValue('Ilhan');
    expect(booker('date of birth')).toHaveValue('2001-02-16');
    expect(booker('nationality')).toHaveValue('Turkish');
    expect(booker('gender')).toHaveValue('FEMALE');
  });

  it('only shares the five identity fields — the address and contact details stay the booker\'s', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await user.click(tickBox());   // even linked, contact details are never shared

    fill('phone number', '+32475123456');
    fill('email', 'ali@example.com');
    fill('emergency contact phone', '+32476987654');
    await user.type(trav('first name'), 'Ali');

    // A traveller edit does not disturb them, and the traveller card never asked for them.
    expect(fieldByLabel('phone number').querySelector('input')).toHaveValue('+32475123456');
    expect(fieldByLabel('email').querySelector('input')).toHaveValue('ali@example.com');
    expect(fieldByLabel('emergency contact phone').querySelector('input')).toHaveValue('+32476987654');
    expect(fieldByLabel('email', travCard())).toBeUndefined();
  });

  it('separates the two records again when the tick comes off', async () => {
    const user = userEvent.setup();
    renderCheckout();

    await user.click(tickBox());                    // link them
    await user.type(booker('first name'), 'Ali');
    expect(trav('first name')).toHaveValue('Ali');

    await user.click(tickBox());                    // unlink
    await user.type(trav('first name'), 'x');       // "Alix" on the traveller only
    expect(trav('first name')).toHaveValue('Alix');
    expect(booker('first name')).toHaveValue('Ali');
  });

  it('keeps whatever was already typed when the tick goes on', async () => {
    const user = userEvent.setup();
    renderCheckout();

    // Unticked by default — fill the booker in on its own first.
    await user.type(booker('first name'), 'Ali');
    await user.type(booker('last name'), 'Benli');
    expect(trav('first name')).toHaveValue('');

    await user.click(tickBox());                    // on: the filled side wins, nothing is lost
    expect(trav('first name')).toHaveValue('Ali');
    expect(trav('last name')).toHaveValue('BENLI');  // surnames are stored capitalised
    expect(booker('first name')).toHaveValue('Ali');
  });

  it('offers the tick on traveller 1 alone', () => {
    renderCheckout();
    expect(document.querySelectorAll('.ck-leadbook')).toHaveLength(1);
    expect(travCard(0).querySelector('.ck-leadbook')).toBeTruthy();
    expect(travCard(1).querySelector('.ck-leadbook')).toBeFalsy();
    expect(screen.getByText(/this traveller is also the lead booker/i)).toBeInTheDocument();
  });
});
