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
  await user.click(screen.getByRole('button', { name: /doorgaan naar extra's/i }));
  await waitFor(() => expect(document.querySelector('.ck-modal')).toBeTruthy());
  for (const tick of document.querySelectorAll('.ck-modal .ck-check')) await user.click(tick);
  await user.click(document.querySelector('.ck-rv-confirm'));
  await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/extra's/i));
};

/** The card whose title matches, so sections that share row styling stay apart. */
const card = (title) => [...document.querySelectorAll('.ck-card')]
  .find((c) => new RegExp(title, 'i').test(c.querySelector('.ck-bagkind-text b')?.textContent || ''));
/** How often a row says "inbegrepen": once, in the green chip (client, 4 Nov 2026). */
const timesIncluded = (row) => (row.textContent.match(/inbegrepen/gi) || []).length;
const sumRow = (label) => [...document.querySelectorAll('.ck-sum-row')]
  .find((r) => new RegExp(label, 'i').test(r.textContent));

/** A hold-baggage row's "add more" menu: what it lists, as "<kg> kg<price>" per option. */
const menuOf = (row) => [...row.querySelectorAll('[role="option"]')];
/** Open the row's menu and pick the weight. The menu shuts on its own once picked. */
const pickBag = async (user, row, kg) => {
  await user.click(row.querySelector('.ck-bagmenu-btn'));
  await user.click(menuOf(row).find((o) => o.textContent.startsWith(`${kg} kg`)));
};

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

    const checked = card('Ruimbagage');
    expect(checked).toBeTruthy();
    // Two travellers x two directions, every one of them already covered by the fare: stated
    // as the weight they can pack, never sold twice. A second bag is still offered, because
    // carrying one does not mean nobody wants another.
    const rows = [...checked.querySelectorAll('.ck-bagrow')];
    expect(rows).toHaveLength(4);
    rows.forEach((r) => {
      expect(r).toHaveTextContent('20 kg ruimbagage');
      expect(r.querySelector('.ck-chip-inc')).toHaveTextContent(/^inbegrepen$/i);
      expect(timesIncluded(r)).toBe(1);
      expect(r.querySelector('.ck-chip-added')).toBeNull();
    });
    expect(checked.querySelectorAll('.ck-bagmenu-btn')).toHaveLength(4);
    // Nothing is open until somebody opens it.
    expect(checked.querySelector('[role="listbox"]')).toBeNull();

    // The client's rule: a fare with hold baggage carries a cabin bag too. The supplier
    // reports handLuggage as 0 on every option, so reading it literally would offer to sell
    // a bag the ticket already includes. The row counts the bag rather than labelling it.
    const cabin = card('Cabin baggage');
    [...cabin.querySelectorAll('.ck-bagrow')].forEach((r) => {
      expect(r).toHaveTextContent('1 stuk handbagage');
      expect(r.querySelector('.ck-chip-inc')).toHaveTextContent(/^inbegrepen$/i);
      expect(timesIncluded(r)).toBe(1);
    });
    expect([...cabin.querySelectorAll('.ck-bag-add')].map((b) => b.textContent))
      .toEqual(expect.arrayContaining([expect.stringMatching(/extra handbagage · €25/i)]));
  });

  it('shows a second cabin bag on a leg that already includes one', async () => {
    const user = userEvent.setup();
    renderCheckout(bookingWith({ checkedKg: 20, checkedPieces: 0, handKg: 8, infantKg: 0 }));
    await toExtras(user);

    const cabin = card('Cabin baggage');
    const [first, ...others] = [...cabin.querySelectorAll('.ck-bagrow')];
    await user.click(first.querySelector('.ck-bag-add'));

    // "Included" alone would hide the bag that was just bought: the row counts both, and the
    // green chip says once what is included and what was added, with the price beside it.
    expect(first).toHaveTextContent('2 stuks handbagage');
    expect(first.querySelector('.ck-chip-inc')).toHaveTextContent(/^inbegrepen \+ 1 extra$/i);
    expect(timesIncluded(first)).toBe(1);
    expect(first.querySelector('.ck-chip-added')).toHaveTextContent('+ €25');
    expect(first.querySelector('.ck-bag-remove')).toHaveTextContent(/verwijderen/i);
    expect(first.querySelector('.ck-bag-add')).toBeNull();
    others.forEach((r) => {
      expect(r).toHaveTextContent('1 stuk handbagage');
      expect(r.querySelector('.ck-chip-added')).toBeNull();
    });

    // Removing it takes the count back down and offers the bag again.
    await user.click(first.querySelector('.ck-bag-remove'));
    expect(first).toHaveTextContent('1 stuk handbagage');
    expect(first).not.toHaveTextContent('extra');
    expect(first.querySelector('.ck-chip-added')).toBeNull();
    expect(first.querySelector('.ck-bag-add')).toBeTruthy();
  });

  it('counts a cabin bag bought on a fare that carries none as the only one', async () => {
    const user = userEvent.setup();
    renderCheckout(bookingWith({ checkedKg: 0, checkedPieces: 0, handKg: 0, infantKg: 0 }));
    await toExtras(user);

    const [first] = [...card('Cabin baggage').querySelectorAll('.ck-bagrow')];
    expect(first).toHaveTextContent(/niet inbegrepen/i);
    expect(first.querySelector('.ck-bag-add')).toHaveTextContent(/handbagage toevoegen · €25/i);

    await user.click(first.querySelector('.ck-bag-add'));
    expect(first).toHaveTextContent('1 stuk handbagage');
    expect(first).toHaveTextContent(/extra/i);
    expect(first).not.toHaveTextContent(/inbegrepen/i);
    expect(first.querySelector('.ck-chip-added')).toHaveTextContent('+ €25');
  });

  it('lists only the hold baggage the airline sells, weight left and price right, and totals the pick', async () => {
    const user = userEvent.setup();
    renderCheckout(bookingWith({ checkedKg: 20, checkedPieces: 0, handKg: 8, infantKg: 0 }));
    await toExtras(user);

    const [row] = [...card('Ruimbagage').querySelectorAll('.ck-bagrow')];
    const btn = row.querySelector('.ck-bagmenu-btn');
    expect(btn).toHaveTextContent(/meer bagage toevoegen/i);
    expect(btn).toHaveAttribute('aria-haspopup', 'listbox');
    expect(btn).toHaveAttribute('aria-expanded', 'false');

    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    // The dashboard's four rows and nothing else; each one is its weight and its price.
    expect(menuOf(row).map((o) => o.textContent)).toEqual(['15 kg€25', '20 kg€35', '25 kg€45', '30 kg€55']);

    await user.click(menuOf(row)[1]);
    // Picked: the menu is gone, the row totals the allowance, and the price sits beside the
    // chip with a way to undo it.
    expect(row.querySelector('[role="listbox"]')).toBeNull();
    expect(row.querySelector('.ck-bagmenu-btn')).toBeNull();
    expect(row).toHaveTextContent('40 kg ruimbagage');
    expect(row.querySelector('.ck-chip-inc')).toHaveTextContent(/^inbegrepen \+ 20 kg extra$/i);
    expect(timesIncluded(row)).toBe(1);
    expect(row.querySelector('.ck-chip-added')).toHaveTextContent('+ €35');
    expect(row.querySelector('.ck-bag-remove')).toHaveTextContent(/verwijderen/i);
    await waitFor(() => expect(sumRow('ruimbagage 20 kg')).toHaveTextContent('€35'));

    // Removing it puts the menu back and takes the line out of the total.
    await user.click(row.querySelector('.ck-bag-remove'));
    expect(row).toHaveTextContent('20 kg ruimbagage');
    expect(row.querySelector('.ck-chip-added')).toBeNull();
    expect(row.querySelector('.ck-bagmenu-btn')).toBeTruthy();
    await waitFor(() => expect(sumRow('ruimbagage 20 kg')).toBeUndefined());
  });

  it('offers exactly the airline\'s own extras when it sells them', async () => {
    const user = userEvent.setup();
    // One hold option from the airline and no cabin bags for sale: the menu lists that one
    // row and the cabin card sells nothing.
    renderCheckout(bookingWith({ checkedKg: 0, checkedPieces: 0, handKg: 8, infantKg: 0,
      addOns: { checked: [{ kg: 23, price: 40 }], cabin: [] } }));
    await toExtras(user);

    const [row] = [...card('Ruimbagage').querySelectorAll('.ck-bagrow')];
    expect(row).toHaveTextContent(/niet inbegrepen/i);
    expect(row.querySelector('.ck-bagmenu-btn')).toHaveTextContent(/ruimbagage toevoegen/i);
    await user.click(row.querySelector('.ck-bagmenu-btn'));
    expect(menuOf(row).map((o) => o.textContent)).toEqual(['23 kg€40']);

    await user.click(menuOf(row)[0]);
    expect(row).toHaveTextContent('23 kg ruimbagage');
    expect(row).toHaveTextContent(/extra/i);
    expect(row.querySelector('.ck-chip-inc')).toBeNull();
    expect(row.querySelector('.ck-chip-added')).toHaveTextContent('+ €40');
  });

  it('keeps a piece allowance in pieces when kilos are added on top', async () => {
    const user = userEvent.setup();
    renderCheckout(bookingWith({ checkedKg: 0, checkedPieces: 1, handKg: 8, infantKg: 0 }));
    await toExtras(user);

    const [row] = [...card('Ruimbagage').querySelectorAll('.ck-bagrow')];
    expect(row).toHaveTextContent('1 stuk ruimbagage');
    await pickBag(user, row, 15);
    // 1 piece + 15 kg is not 16 of anything, so neither line adds them up.
    expect(row).toHaveTextContent('1 stuk + 15 kg ruimbagage');
    expect(row.querySelector('.ck-chip-inc')).toHaveTextContent(/^inbegrepen \+ 15 kg extra$/i);
    expect(timesIncluded(row)).toBe(1);
  });

  it('shuts the menu on an outside click and on Escape, and is a listbox to the keyboard', async () => {
    const user = userEvent.setup();
    renderCheckout(bookingWith({ checkedKg: 20, checkedPieces: 0, handKg: 8, infantKg: 0 }));
    await toExtras(user);

    const [row, next] = [...card('Ruimbagage').querySelectorAll('.ck-bagrow')];
    const btn = row.querySelector('.ck-bagmenu-btn');

    await user.click(btn);
    expect(row.querySelector('[role="listbox"]')).toBeTruthy();
    await user.click(document.body);
    expect(row.querySelector('[role="listbox"]')).toBeNull();

    // Opening another row's menu is an outside click for this one.
    await user.click(btn);
    await user.click(next.querySelector('.ck-bagmenu-btn'));
    expect(row.querySelector('[role="listbox"]')).toBeNull();
    expect(next.querySelector('[role="listbox"]')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(next.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(next.querySelector('.ck-bagmenu-btn'));

    // Arrows open the list and walk it, Enter picks, nothing needs a mouse.
    btn.focus();
    await user.keyboard('{ArrowDown}');
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(menuOf(row)[0]);
    expect(menuOf(row)[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(menuOf(row)[1]);
    await user.keyboard('{Enter}');
    expect(row.querySelector('[role="listbox"]')).toBeNull();
    expect(row).toHaveTextContent('40 kg ruimbagage');
    expect(row.querySelector('.ck-chip-added')).toHaveTextContent('+ €35');
  });

  it('follows the checked allowance for the cabin bag, even when the airline reports none', async () => {
    const user = userEvent.setup();
    // 20 kg in the hold, handLuggage 0 — exactly what Airtuerk sends on a fare that does
    // include a cabin bag.
    renderCheckout(bookingWith({ checkedKg: 20, checkedPieces: 0, handKg: 0, infantKg: 0 }));
    await toExtras(user);

    const cabin = card('Cabin baggage');
    [...cabin.querySelectorAll('.ck-bagrow')].forEach((r) => {
      expect(r).toHaveTextContent(/inbegrepen/i);
      expect(r).not.toHaveTextContent(/niet inbegrepen/i);
    });
  });

  it('says the allowance is unknown when the airline sent none at all', async () => {
    const user = userEvent.setup();
    renderCheckout(bookingWith(null));      // no baggage object on the fare
    await toExtras(user);

    // Not "Not included" — that is a claim about the ticket we have no basis for. The bag is
    // still offered, which is the right thing to do when nobody has told us otherwise.
    const cabin = card('Cabin baggage');
    expect(cabin).toHaveTextContent(/niet bevestigd/i);
    expect(cabin.querySelectorAll('.ck-bag-add').length).toBeGreaterThan(0);
  });

  it('charges an added bag once, for the traveller and leg it was added to', async () => {
    const user = userEvent.setup();
    // A fare with NO hold allowance: every leg has something to sell.
    renderCheckout(bookingWith({ checkedKg: 0, checkedPieces: 0, handKg: 8, infantKg: 0 }));
    await toExtras(user);

    const checked = card('Ruimbagage');
    const rows = [...checked.querySelectorAll('.ck-bagrow')];
    expect(checked.querySelectorAll('.ck-bagmenu-btn')).toHaveLength(4);   // 2 travellers x outbound + return

    // Traveller 1's return leg: 20 kg at €35 from the dashboard's table. The breakdown names
    // the bag rather than saying "Baggage": two different bags at the same price are
    // indistinguishable otherwise, and the traveller is checking what they are paying for.
    await pickBag(user, rows[1], 20);
    await waitFor(() => expect(sumRow('ruimbagage 20 kg')).toBeTruthy());
    expect(sumRow('ruimbagage 20 kg')).toHaveTextContent('€35');

    // A second, DIFFERENT bag is its own line, not merged into a count.
    await pickBag(user, rows[2], 15);
    await waitFor(() => expect(sumRow('ruimbagage 15 kg')).toBeTruthy());
    expect(sumRow('ruimbagage 15 kg')).toHaveTextContent('€25');
    expect(sumRow('ruimbagage 20 kg')).toHaveTextContent('€35');
  });

  it('keeps the same bag on one line, with a count', async () => {
    const user = userEvent.setup();
    renderCheckout(bookingWith({ checkedKg: 0, checkedPieces: 0, handKg: 8, infantKg: 0 }));
    await toExtras(user);

    const rows = [...card('Ruimbagage').querySelectorAll('.ck-bagrow')];
    // The SAME bag twice: outbound and return of traveller 1.
    await pickBag(user, rows[0], 20);
    await pickBag(user, rows[1], 20);

    await waitFor(() => expect(sumRow('ruimbagage 20 kg')).toHaveTextContent('× 2'));
    expect(sumRow('ruimbagage 20 kg')).toHaveTextContent('€70');
  });
});

describe('the two insurance decisions', () => {
  it('sends cancellation for the party and travel cover only for those who took it', async () => {
    const user = userEvent.setup();
    renderCheckout(bookingWith({ checkedKg: 20, checkedPieces: 0, handKg: 8, infantKg: 0 }));
    await toExtras(user);

    // Cancellation: one choice for the booking.
    const cancel = card('Bescherm je reis');
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

    // "Controleer je boeking" sits between the extras and the payment sheet, so the
    // way out of the extras leads there first.
    await user.click(screen.getByRole('button', { name: /verder naar overzicht/i }));
    await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/overzicht/i));
    await user.click(screen.getByRole('button', { name: /doorgaan naar betaling/i }));
    await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/betaling/i));
    await user.click(screen.getByRole('button', { name: /bancontact/i }));
    acceptConditions();   // each condition has its own box now
    await user.click(screen.getByRole('button', { name: /^betaal /i }));

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

describe('cancellation cover and the bags added on top', () => {
  // Production, 1 Nov 2026: every booking with an added bag AND cancellation cover was refused
  // with "Prices have changed or could not be verified". The checkout took 6% of the subtotal
  // WITH the bags, the server 6% of the trip without them (flight + hotel + transfer), and the
  // difference was over the server's tolerance. The premium is a percentage of the trip.
  it('prices cancellation cover on the trip, not on the bags, exactly as the server does', async () => {
    const user = userEvent.setup();
    renderCheckout(bookingWith({ checkedKg: 0, checkedPieces: 0, handKg: 8, infantKg: 0 }));
    await toExtras(user);

    // A 20 kg bag for traveller 1 on the way out: €35 on top of the €600 stay.
    const [row] = [...card('Ruimbagage').querySelectorAll('.ck-bagrow')];
    await pickBag(user, row, 20);
    await waitFor(() => expect(sumRow('ruimbagage 20 kg')).toHaveTextContent('€35'));

    // Cancellation cover for the party; nobody takes travel cover.
    await user.click([...card('Bescherm je reis').querySelectorAll('.ck-tr')][0]);
    for (const block of card('travel insurance').querySelectorAll('.ck-bagtrav')) {
      await user.click(block.querySelectorAll('.ck-tr')[1]);
    }

    await user.click(screen.getByRole('button', { name: /verder naar overzicht/i }));
    await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/overzicht/i));
    await user.click(screen.getByRole('button', { name: /doorgaan naar betaling/i }));
    await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/betaling/i));
    await user.click(screen.getByRole('button', { name: /bancontact/i }));
    acceptConditions();
    await user.click(screen.getByRole('button', { name: /^betaal /i }));

    await waitFor(() => expect(post.mock.calls.some(([url]) => String(url).includes('online-bookings'))).toBe(true));
    const [, body] = post.mock.calls.find(([url]) => String(url).includes('online-bookings'));
    const cancelLine = body.insurances.find((i) => i.type === 'cancel');
    // 6% of €600 = €36. With the bag in the base it was 6% of €635 = €38, which the server
    // (6% of €600) refused.
    expect(cancelLine.price).toBe(36);
    expect(body.extrasTotal).toBe(35);
  });
});
