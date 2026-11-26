import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import Checkout from './Checkout';
import i18n from '../../i18n';
import { fetchCheckoutTerms } from './termsApi';
import { termsViewFor } from '../../test/checkoutTermsFixture';
import { fillContact, fillTraveller } from '../../test/checkoutForm';

// "Garantie en voorwaarden" (SUNSKY Checkout Terms & Conditions spec V1.3 FINAL): the section
// the server describes, one mandatory travel acceptance (plus the Allianz one when cover was
// chosen), the final declaration above a "Boek en betaal" button that stays disabled until
// accepted, a fresh acceptance whenever what was accepted changes, and the acceptance sent with
// the booking. The shared setup answers the terms request with termsViewFor(body).

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
  board: 'All inclusive', nights: 7, adults: 1, currency: '€',
  ppPrice: 600, dateLabel: '7 Sep — 14 Sep', flight: null, room: 'Double Room', roomExtra: 0,
  search: { adults: 1, children: 0, rooms: 1, checkin: '2026-09-07', checkout: '2026-09-14' },
  api: {
    hotel: {
      hotelCode: '300984', checkin: '2026-09-07', checkout: '2026-09-14', nights: 7,
      rateKey: 'RATE-1', roomCode: 'DBL', boardCode: 'AI', price: 600, currency: '€',
      supplier: 'hotelbeds', cancellation: [{ from: '2099-01-01T00:00:00+02:00', amount: '600.00' }],
    },
  },
};

const auth = createSlice({ name: 'auth', initialState: { isAuthenticated: false, user: null }, reducers: {} });
const renderCheckout = () => render(
  <Provider store={configureStore({ reducer: { auth: auth.reducer } })}>
    <MemoryRouter initialEntries={[{ pathname: '/checkout', state: { booking: BOOKING } }]}>
      <Routes><Route path="/checkout" element={<Checkout />} /></Routes>
    </MemoryRouter>
  </Provider>
);

const reachPayment = async (user) => {
  fillContact();
  fillTraveller(0, { dob: '1995-11-19' });
  await user.click(screen.getByRole('button', { name: /doorgaan naar extra's/i }));
  await waitFor(() => expect(document.querySelector('.ck-modal')).toBeTruthy());
  await user.click(document.querySelector('.ck-modal .ck-check'));
  await user.click(document.querySelector('.ck-rv-confirm'));
  await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/extra's/i));
  await user.click(screen.getByRole('button', { name: /verder naar overzicht/i }));
  await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/overzicht/i));
  await user.click(screen.getByRole('button', { name: /doorgaan naar betaling/i }));
  await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/betaling/i));
  await user.click(screen.getByRole('button', { name: /bancontact/i }));
  await waitFor(() => expect(document.querySelector('.ck-terms #ck-terms-title')).toBeTruthy());
};

const section = () => document.querySelector('.ck-terms');
const travelBox = () => section().querySelector('input[name="travelAcceptance"]');
const payBtn = () => screen.getByRole('button', { name: /^(boek en betaal|book and pay) /i });

beforeEach(() => {
  post.mockReset();
  post.mockImplementation(() => Promise.resolve({ data: {} }));
  vi.mocked(fetchCheckoutTerms).mockReset();
  vi.mocked(fetchCheckoutTerms).mockImplementation((body) => Promise.resolve(termsViewFor(body)));
});

describe('Garantie en voorwaarden', () => {
  it('shows the approved section, neutral links and one unticked travel checkbox; no SGR', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await reachPayment(user);

    expect(within(section()).getByRole('heading', { name: 'Garantie en voorwaarden' })).toBeTruthy();
    expect(section()).toHaveTextContent('Ik heb kennisgenomen van de beschrijving van mijn reis, de belangrijke reisinformatie en het actuele reisadvies.');
    // Each condition document behind its own link, in a new tab so the checkout keeps its data.
    const general = within(section()).getAllByRole('link', { name: 'algemene reisvoorwaarden' })[0];
    expect(general).toHaveAttribute('href', '/p/terms#algemene');
    expect(general).toHaveAttribute('target', '_blank');
    expect(within(section()).getAllByRole('link', { name: 'bijzondere reisvoorwaarden van SUNSKY' }).length).toBeGreaterThan(0);
    // One mandatory checkbox, never preselected, and no insurance checkbox without insurance.
    expect(travelBox()).not.toBeChecked();
    expect(section().querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    expect(section().querySelector('.ck-cond-item.on')).toBeFalsy();
    expect(section()).toHaveTextContent('privacyverklaring');
    expect(document.body.textContent).not.toMatch(/SGR/);
    // The terms were asked for this booking: a hotel, no flight, no insurance.
    const body = vi.mocked(fetchCheckoutTerms).mock.calls.at(-1)[0];
    expect(body).toMatchObject({ flight: null, hotel: { supplier: 'hotelbeds' }, transfer: null, insurances: [], language: 'nl' });
  });

  it('keeps "Boek en betaal" disabled until accepted, with the final declaration right above it', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await reachPayment(user);

    expect(payBtn()).toBeDisabled();
    // The amount payable now, from the page's own total (a €600 stay paid in full).
    expect(payBtn().textContent.trim()).toBe('Boek en betaal € 600,00');
    const final = document.querySelector('.ck-final');
    expect(final).toHaveTextContent('Definitieve boeking');
    expect(final).toHaveTextContent('Door je boeking te bevestigen, ga je een betalingsverplichting aan voor het volledige boekingsbedrag.');
    expect(final).toHaveTextContent('Op deze reisboeking is geen wettelijk herroepingsrecht van toepassing.');
    expect(within(final).getByRole('link', { name: 'herroepingsrecht' })).toHaveAttribute('href', '/p/terms#herroepingsrecht');
    expect(final.compareDocumentPosition(payBtn()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/bedenktijd|14 dagen/i);

    await user.click(travelBox());
    expect(payBtn()).toBeEnabled();
  });

  it('sends the acceptance with the booking: terms key, ticks, session and the exact button text', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await reachPayment(user);
    await user.click(travelBox());
    const label = payBtn().textContent.trim();
    await user.click(payBtn());

    await waitFor(() => expect(post.mock.calls.some(([url]) => String(url).includes('online-bookings'))).toBe(true));
    const [, body] = post.mock.calls.find(([url]) => String(url).includes('online-bookings'));
    expect(body.acceptance).toMatchObject({
      termsKey: 'test-terms-single-none', travelAccepted: true, insuranceAccepted: false, language: 'nl', paymentMethod: 'bancontact',
    });
    expect(body.acceptance.payButtonText).toBe(label);
    expect(body.acceptance.checkoutSessionId).toEqual(expect.any(String));
    expect(body.consents.some((c) => c.code === 'BOOKING_CONDITIONS')).toBe(false);
  });

  it('asks again when the server says the conditions changed, with the new terms and unticked boxes', async () => {
    const user = userEvent.setup();
    const fresh = { ...termsViewFor({ hotel: {} }), termsKey: 'fresh-key', sectionTitle: 'Garantie en voorwaarden' };
    post.mockImplementation((url) => (String(url).includes('online-bookings')
      ? Promise.reject({ response: { status: 409, data: { success: false, errorCode: 'TERMS_CHANGED', message: 'changed', errors: [{ terms: fresh }] } } })
      : Promise.resolve({ data: {} })));
    renderCheckout();
    await reachPayment(user);
    await user.click(travelBox());
    await user.click(payBtn());

    await waitFor(() => expect(section().querySelector('.ck-terms-notice')).toHaveTextContent(/voorwaarden voor deze boeking zijn gewijzigd/i));
    expect(travelBox()).not.toBeChecked();
    expect(payBtn()).toBeDisabled();
    // The next acceptance carries the new key.
    post.mockImplementation(() => Promise.resolve({ data: {} }));
    await user.click(travelBox());
    await user.click(payBtn());
    await waitFor(() => {
      const calls = post.mock.calls.filter(([url]) => String(url).includes('online-bookings'));
      expect(calls.at(-1)[1].acceptance.termsKey).toBe('fresh-key');
    });
  });

  it('unticks the acceptance when something accepted changes afterwards (here: the language)', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await reachPayment(user);
    await user.click(travelBox());
    expect(travelBox()).toBeChecked();
    // Switching the payment method changes nothing that was accepted.
    await user.click(screen.getByRole('button', { name: /^ideal/i }));
    expect(travelBox()).toBeChecked();

    // §16: the applicable language is part of what was accepted.
    try {
      await act(() => i18n.changeLanguage('en'));
      await waitFor(() => expect(section().querySelector('.ck-terms-notice')).toBeTruthy());
      expect(travelBox()).not.toBeChecked();
      expect(payBtn()).toBeDisabled();
      expect(vi.mocked(fetchCheckoutTerms).mock.calls.at(-1)[0].language).toBe('en');
    } finally {
      await act(() => i18n.changeLanguage('nl'));
    }
  });

  it('opens the trip description from the travel information without leaving the page', async () => {
    const user = userEvent.setup();
    renderCheckout();
    await reachPayment(user);
    await user.click(within(section()).getByRole('button', { name: 'beschrijving van mijn reis' }));
    const dialog = await screen.findByRole('dialog', { name: 'Beschrijving van je reis' });
    expect(dialog).toHaveTextContent('Test Hotel');
    await user.click(within(dialog).getByRole('button', { name: /sluiten|close/i }));
    expect(screen.queryByRole('dialog', { name: 'Beschrijving van je reis' })).toBeNull();

    await user.click(within(section()).getByRole('button', { name: 'belangrijke reisinformatie' }));
    const info = await screen.findByRole('dialog', { name: 'Belangrijke reisinformatie' });
    expect(info).toHaveTextContent('SUNSKY op als verkoper van een afzonderlijke reisdienst');
    expect(info).toHaveTextContent(/paspoort/i);
  });

  it('blocks the booking when the conditions cannot be loaded, and offers to try again', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchCheckoutTerms).mockImplementation(() => Promise.reject(new Error('offline')));
    renderCheckout();
    fillContact();
    fillTraveller(0, { dob: '1995-11-19' });
    await user.click(screen.getByRole('button', { name: /doorgaan naar extra's/i }));
    await waitFor(() => expect(document.querySelector('.ck-modal')).toBeTruthy());
    await user.click(document.querySelector('.ck-modal .ck-check'));
    await user.click(document.querySelector('.ck-rv-confirm'));
    await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/extra's/i));
    await user.click(screen.getByRole('button', { name: /verder naar overzicht/i }));
    await user.click(await screen.findByRole('button', { name: /doorgaan naar betaling/i }));
    await waitFor(() => expect(section()).toHaveTextContent(/konden niet worden geladen/i));
    expect(payBtn()).toBeDisabled();

    vi.mocked(fetchCheckoutTerms).mockImplementation((body) => Promise.resolve(termsViewFor(body)));
    await user.click(within(section()).getByRole('button', { name: 'Opnieuw proberen' }));
    await waitFor(() => expect(section().querySelector('input[name="travelAcceptance"]')).toBeTruthy());
  });
});

describe('with Allianz cover', () => {
  it('adds the Verzekeringen section and its own mandatory checkbox', async () => {
    const view = termsViewFor({ hotel: {}, insurances: [{ type: 'cancel' }] });
    vi.mocked(fetchCheckoutTerms).mockImplementation(() => Promise.resolve(view));
    const user = userEvent.setup();
    renderCheckout();
    await reachPayment(user);

    const ins = section().querySelector('.ck-terms-ins');
    expect(ins).toHaveTextContent('Verzekeringen');
    expect(ins).toHaveTextContent('Annuleringsverzekering');
    expect(within(ins).getByRole('link', { name: 'Verzekeringsvoorwaarden cancellation' })).toHaveAttribute('href', 'https://cdn.test/CANCELLATION.pdf');
    const insBox = section().querySelector('input[name="insuranceAcceptance"]');
    expect(insBox).not.toBeChecked();
    expect(ins).toHaveTextContent('Ik ga akkoord met de voorwaarden van mijn gekozen verzekering en bevestig');

    await user.click(travelBox());
    expect(payBtn()).toBeDisabled();
    await user.click(insBox);
    expect(payBtn()).toBeEnabled();
  });
});
