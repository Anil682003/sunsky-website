import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';
import { fillContact, fillTraveller } from '../../test/checkoutForm';

// "Controleer je boeking" — the last read before the card comes out.
//
// What is asserted here is what the client asked the page to be: the whole booking on one
// screen, text only, built from the booking data rather than from anything the page happened
// to be showing; the optional sections ABSENT when there is nothing in them, and present with
// the customer's own words when there is; and no price breakdown, because the summary beside
// it already carries one and two copies of a total is how they come to disagree.

const post = vi.fn();
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
  flight: {
    outDep: '09:00', outArr: '13:40', outFrom: 'BRU', outTo: 'AYT',
    outDate: 'Mo 7 sep 2026', outAirline: 'TUI fly', outAirlineCode: 'TB', outDur: '4u 40m',
    retDep: '23:45', retArr: '01:40', retFrom: 'AYT', retTo: 'BRU',
    retDate: 'Mo 14 sep 2026', retAirline: 'TUI fly', retAirlineCode: 'TB', retDur: '3u 55m',
  },
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
        // Lands after midnight: the page has to say +1 beside the arrival time.
        { from: 'AYT', to: 'BRU', departure: '2026-09-14T23:45:00', arrival: '2026-09-15T01:40:00', airline: 'TB', flightNumber: '4522' },
      ],
    },
  },
};

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false, user: null }, reducers: {} });
const renderCheckout = () => render(
  <Provider store={configureStore({ reducer: { auth: auth.reducer } })}>
    <MemoryRouter initialEntries={[{ pathname: '/checkout', state: { booking: BOOKING } }]}>
      <Routes><Route path="/checkout" element={<Checkout />} /></Routes>
    </MemoryRouter>
  </Provider>,
);

/** Step 1 → extras → overview, the way a traveller walks it. */
const toOverview = async (user) => {
  fillContact();
  fillTraveller(0, { firstName: 'Ali', lastName: 'Benli', dob: '1990-01-01' });
  fillTraveller(1, { firstName: 'Aylin', lastName: 'Benli', dob: '1992-05-05', gender: 'FEMALE' });
  await user.click(screen.getByRole('button', { name: /doorgaan naar extra's/i }));
  await waitFor(() => expect(document.querySelector('.ck-modal')).toBeTruthy());
  for (const tick of document.querySelectorAll('.ck-modal .ck-check')) await user.click(tick);
  await user.click(document.querySelector('.ck-rv-confirm'));
  await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/extra's/i));
};

const toReview = async (user) => {
  await toOverview(user);
  await user.click(screen.getByRole('button', { name: /verder naar overzicht/i }));
  await waitFor(() => expect(document.querySelector('.ck-rv')).toBeTruthy());
};

const sections = () => [...document.querySelectorAll('.ck-rv-sec')];
const sectionTitled = (re) => sections().find((s) => re.test(s.querySelector('.ck-rv-t')?.textContent || ''));
const rowValue = (section, re) => [...section.querySelectorAll('.ck-rv-row')]
  .find((r) => re.test(r.querySelector('.ck-rv-k')?.textContent || ''))
  ?.querySelector('.ck-rv-v')?.textContent?.trim();

beforeEach(() => { post.mockReset(); post.mockResolvedValue({ data: { data: {} } }); });

describe('the booking overview before payment', () => {
  it('is a step of its own between the extras and the payment sheet', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await toReview(user);

    expect(document.querySelector('.ck-step.act')).toHaveTextContent(/overzicht|boeking/i);
    // And the way on from here is the payment sheet, not another extras page.
    expect(screen.getByRole('button', { name: /doorgaan naar betaling/i })).toBeTruthy();
  });

  it('states the trip in days, never in nights', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await toReview(user);

    const trip = sectionTitled(/reisoverzicht/i);
    expect(trip).toBeTruthy();
    // Seven nights away is eight days, and the traveller counts days.
    expect(rowValue(trip, /reisduur/i)).toMatch(/8 dagen/);
    expect(rowValue(trip, /accommodatie/i)).toBe('Test Hotel');
    expect(rowValue(trip, /reisgezelschap/i)).toMatch(/2 reizigers/);
  });

  it('says which day a flight lands on when that is not the day it left', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await toReview(user);

    const flights = sectionTitled(/vluchten/i);
    expect(flights).toBeTruthy();
    const legs = flights.querySelectorAll('.ck-rv-leg');
    expect(legs).toHaveLength(2);
    // Outbound lands the same day; the return crosses midnight.
    expect(legs[0].querySelector('.ck-rv-plus')).toBeNull();
    expect(legs[1].querySelector('.ck-rv-plus')?.textContent).toBe('+1');
    expect(legs[1].textContent).toMatch(/4522/);           // the flight number it was sold as
    expect(legs[0].textContent).toMatch(/directe vlucht/i); // one leg, no connection
  });

  it('names every traveller with their date of birth, and marks the lead', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await toReview(user);

    const people = sectionTitled(/reizigers/i).querySelectorAll('.ck-rv-person');
    expect(people).toHaveLength(2);
    expect(people[0].textContent).toMatch(/Ali/);
    expect(people[0].textContent).toMatch(/hoofdreiziger/i);
    expect(people[0].textContent).toMatch(/01\/01\/1990|1990/);
    expect(people[1].textContent).not.toMatch(/hoofdreiziger/i);
  });

  it('leaves out the optional sections when the traveller wrote nothing', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await toReview(user);

    // An empty "Special requests" heading over a dash reads as something lost.
    expect(sectionTitled(/speciale wensen/i)).toBeUndefined();
    expect(sectionTitled(/bericht aan sunsky/i)).toBeUndefined();
  });

  it('shows the hotel request and the message to SUNSKY in the words they were written in', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await toOverview(user);

    const wish = 'Graag een rustige kamer op een hoge verdieping.';
    const note = 'Reiziger heeft rolstoelassistentie nodig op de luchthaven.';
    const areas = [...document.querySelectorAll('.ck-area')];
    expect(areas.length).toBeGreaterThanOrEqual(2);
    await user.type(areas[0], wish);
    await user.type(areas[areas.length - 1], note);

    await user.click(screen.getByRole('button', { name: /verder naar overzicht/i }));
    await waitFor(() => expect(document.querySelector('.ck-rv')).toBeTruthy());

    const wishSec = sectionTitled(/speciale wensen/i);
    const noteSec = sectionTitled(/bericht aan sunsky/i);
    expect(wishSec?.querySelector('.ck-rv-quote')?.textContent).toBe(wish);
    expect(noteSec?.querySelector('.ck-rv-quote')?.textContent).toBe(note);
    // Each carries its own caveat: a wish is not a promise, and a request is not a booking.
    expect(wishSec.textContent).toMatch(/niet worden gegarandeerd/i);
    expect(noteSec.textContent).toMatch(/pas bevestigd/i);
  });

  it('carries no prices and no edit buttons — the summary holds one total, this holds the facts', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await toReview(user);

    const page = document.querySelector('.ck-rv');
    expect(page.textContent).not.toMatch(/€/);
    expect(page.querySelectorAll('button')).toHaveLength(0);
  });
});
