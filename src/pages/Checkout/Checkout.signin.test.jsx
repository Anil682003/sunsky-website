import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../store/slices/authSlice';
import PublicRoute from '../../components/PublicRoute';
import Register from '../Auth/Register';
import Checkout from './Checkout';
import { openCheckoutSignIn } from '../../utils/checkoutSignIn';
import { fill, fillContact, fillTraveller, fieldByLabel, contactFields } from '../../test/checkoutForm';

// An existing customer who signs in from the checkout carries on with the booking they were
// making: same trip, same step, everything typed kept, and the account filling only what is
// still empty. Signing in happens in a dialog on the page, so nothing unmounts; leaving the page
// (to create an account) comes back to the same form through the draft.
//
// Real router, real auth reducer, real PublicRoute: the way this used to fail was a redirect
// race between them, so a test with any of them stubbed would pass while the site did not.

const { api, showToast } = vi.hoisted(() => ({ api: vi.fn(), showToast: vi.fn() }));
vi.mock('../../services/axiosInstance', () => {
  const instance = vi.fn((c = {}) => api(String(c.method || 'GET').toUpperCase(), c.url, c.data, c));
  instance.post = (u, b, c) => api('POST', u, b, c);
  instance.get = (u, c) => api('GET', u, undefined, c);
  return { default: instance, SUPPLIER_TIMEOUT: 25000 };
});
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));

const ACCOUNT = { id: 7, name: 'Ayse Yilmaz', email: 'ayse@example.com', role: 'customer', currentRoleId: 3 };
const PROFILE = {
  type: 'private', firstName: 'Ayse', lastName: 'Yilmaz', email: 'ayse@example.com',
  street: 'Meir', houseNumber: '7', postalCode: '2000', city: 'Antwerpen', phone: '+32470112233',
};

const HOTEL_ONLY = {
  hotelCode: '300984', hotelName: 'Test Hotel', stars: 4, loc: 'Alanya, Türkiye', img: '',
  board: 'All inclusive', nights: 7, adults: 1, currency: '€',
  ppPrice: 600, dateLabel: '7 Sep - 14 Sep', room: 'Double Room', roomExtra: 0,
  search: { destination: 'AYT', origin: 'BRU', transport: 'hotel_only', checkin: '2026-09-07', checkout: '2026-09-14', adults: 1, children: 0, rooms: 1 },
  api: { hotel: { hotelCode: '300984', checkin: '2026-09-07', checkout: '2026-09-14', nights: 7, rateKey: 'R1', price: 600, currency: '€' } },
};

// A flight + hotel trip with one free cabin bag, so the extras step has something to add.
const WITH_FLIGHT = {
  ...HOTEL_ONLY,
  adults: 2,
  ppPrice: 300,
  search: { ...HOTEL_ONLY.search, adults: 2 },
  api: {
    hotel: { ...HOTEL_ONLY.api.hotel, price: 600 },
    flight: {
      from: 'BRU', to: 'AYT', depdate: '2026-09-07', retdate: '2026-09-14', price: 0, tripType: 'roundtrip',
      legs: [
        { from: 'BRU', to: 'AYT', departure: '2026-09-07T09:00:00', arrival: '2026-09-07T13:40:00', airline: 'TB', flightNumber: '4521' },
        { from: 'AYT', to: 'BRU', departure: '2026-09-14T15:00:00', arrival: '2026-09-14T18:10:00', airline: 'TB', flightNumber: '4522' },
      ],
      baggage: { checkedKg: 20, checkedPieces: 0, handKg: 8, infantKg: 0 },
    },
  },
};

const ok = (data) => Promise.resolve({ data });
const fail = (status, message) => Promise.reject(Object.assign(new Error(message || String(status)), {
  response: { status, data: { success: false, message } },
}));

/** Answers by URL, so the tests do not depend on which call style the page uses. */
const routes = ({ exists = false, me = { customerProfile: PROFILE }, login, onMe, onRefresh } = {}) => {
  api.mockImplementation((method, url, body) => {
    const u = String(url || '');
    if (u.includes('/auth/email-check')) return ok({ data: { exists } });
    if (u.includes('/auth/login')) {
      return login ? login(body) : ok({ success: true, data: { accessToken: 'AT-NEW', refreshToken: 'RT-NEW', user: ACCOUNT } });
    }
    if (u.includes('/auth/refresh')) return onRefresh ? onRefresh(body) : fail(401, 'expired');
    if (u.includes('/auth/me')) return onMe ? onMe() : ok({ success: true, data: { id: 7, name: ACCOUNT.name, email: ACCOUNT.email, ...me } });
    return ok({});
  });
};

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname}</output>;
}

const makeStore = (preloadedAuth) => configureStore({
  reducer: { auth: authReducer },
  ...(preloadedAuth ? { preloadedState: { auth: preloadedAuth } } : {}),
});

const renderApp = ({ booking = HOTEL_ONLY, store = makeStore() } = {}) => {
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[{ pathname: '/checkout', state: { booking } }]}>
        <Where />
        <Routes>
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
          <Route path="/" element={<p>HOME</p>} />
          <Route path="/account/bookings" element={<p>ACCOUNT</p>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
};

const where = () => screen.getByTestId('where').textContent;
const val = (label, root = contactFields()) => fieldByLabel(label, root)?.querySelector('input,select,textarea')?.value;
const travellerCard = (i) => [...document.querySelectorAll('.ck-trav')][i];
const dialog = () => screen.queryByRole('dialog', { name: /inloggen en verder boeken/i });

const signInThroughDialog = async (user, password = 'Secret123!') => {
  const box = await screen.findByRole('dialog', { name: /inloggen en verder boeken/i });
  await user.type(within(box).getByLabelText(/^wachtwoord$/i), password);
  await user.click(within(box).getByRole('button', { name: /inloggen en verder/i }));
  await waitFor(() => expect(dialog()).toBeNull());
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  showToast.mockReset();
  window.scrollTo = vi.fn();
  routes();
});

describe('signing in from the checkout', () => {
  it('signs in on the page and carries on with everything typed, filling only the gaps', async () => {
    const user = userEvent.setup();
    routes({ exists: true });
    const store = renderApp();

    // A guest gets half way: a first name and the email, no address yet.
    const card = contactFields();
    fill('voornaam', 'Mehmet', card);
    fill('e-mailadres', 'ali@example.com');
    fillTraveller(0, { firstName: 'Mehmet', lastName: 'Kaya', dob: '1991-02-03' });

    // Leaving the email field finds the account, and its "Log in" opens the dialog right here.
    await user.click(fieldByLabel('e-mailadres', contactFields()).querySelector('input'));
    await user.tab();
    await waitFor(() => expect(document.querySelector('.ck-email-known')).toBeTruthy());
    await user.click(within(document.querySelector('.ck-email-known')).getByRole('button', { name: /^inloggen$/i }));
    await signInThroughDialog(user);

    // Still the checkout, still step 1, signed in.
    expect(where()).toBe('/checkout');
    expect(document.querySelector('.ck-step.act')).toHaveTextContent(/jouw gegevens/i);
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(localStorage.getItem('refreshToken')).toBe('RT-NEW');
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'success');

    // The account filled what was empty; what was typed stayed.
    await waitFor(() => expect(val('stad')).toBe('Antwerpen'));
    expect(val('postcode')).toBe('2000');
    expect(val('voornaam')).toBe('Mehmet');
    expect(val('voornaam', travellerCard(0))).toBe('Mehmet');
    expect(val('achternaam', travellerCard(0))).toBe('KAYA');

    // The booking now belongs to the account's address: shown, read-only, and said so.
    const emailBox = fieldByLabel('e-mailadres', contactFields()).querySelector('input');
    expect(emailBox).toHaveValue('ayse@example.com');
    expect(emailBox).toHaveAttribute('readonly');
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/ayse@example\.com/), 'info');

    // The guest's "this address has an account" panel went with the guest.
    expect(document.querySelector('.ck-email-known')).toBeNull();
    expect(document.querySelector('.ck-auth-banner')).toHaveTextContent(/welkom terug, ayse/i);
  });

  it('opens the same dialog from the header on a later step, and keeps that step and its extras', async () => {
    const user = userEvent.setup();
    renderApp({ booking: WITH_FLIGHT });
    fillContact();
    fillTraveller(0, { firstName: 'Ali', lastName: 'Benli', dob: '1990-01-01' });
    fillTraveller(1, { firstName: 'Aylin', lastName: 'Benli', dob: '1992-05-05', gender: 'FEMALE' });

    // Through the passport-name check to the extras.
    await user.click(screen.getByRole('button', { name: /doorgaan naar extra's/i }));
    await waitFor(() => expect(document.querySelector('.ck-modal')).toBeTruthy());
    for (const tick of document.querySelectorAll('.ck-modal .ck-check')) await user.click(tick);
    await user.click(document.querySelector('.ck-rv-confirm'));
    await waitFor(() => expect(document.querySelector('.ck-step.act')).toHaveTextContent(/extra's/i));

    // Add a second cabin bag for traveller 1 on the way out.
    const cabin = [...document.querySelectorAll('.ck-card')]
      .find((c) => /cabin baggage|handbagage/i.test(c.querySelector('.ck-bagkind-text b')?.textContent || ''));
    await user.click(cabin.querySelector('.ck-bagrow .ck-bag-add'));
    expect(cabin.querySelector('.ck-bagrow .ck-chip-added')).toBeTruthy();

    // The header's sign-in link asks the checkout to open its dialog (utils/checkoutSignIn).
    let handled;
    act(() => { handled = openCheckoutSignIn(); });
    expect(handled).toBe(true);
    await signInThroughDialog(user);

    // Same step, same bag, same names: nothing unmounted.
    expect(where()).toBe('/checkout');
    expect(document.querySelector('.ck-step.act')).toHaveTextContent(/extra's/i);
    expect(cabin.querySelector('.ck-bagrow .ck-chip-added')).toBeTruthy();
  });

  it('comes back from creating an account to the same form', async () => {
    const user = userEvent.setup();
    renderApp();
    fill('voornaam', 'Mehmet', contactFields());
    fill('stad', 'Gent');
    fillTraveller(0, { firstName: 'Mehmet', lastName: 'Kaya', dob: '1991-02-03' });

    await user.click(within(document.querySelector('.ck-signin-invite')).getByRole('button', { name: /inloggen/i }));
    const box = await screen.findByRole('dialog', { name: /inloggen en verder boeken/i });
    await user.click(within(box).getByRole('button', { name: /account aanmaken/i }));
    await waitFor(() => expect(where()).toBe('/register'));

    // Changed their mind on the register page: back to the checkout as a guest.
    await user.click(await screen.findByRole('button', { name: /doorgaan als gast/i }));
    await waitFor(() => expect(where()).toBe('/checkout'));

    // The trip and everything typed are back.
    expect((await screen.findAllByText('Test Hotel')).length).toBeGreaterThan(0);
    expect(document.querySelector('.ck-gone')).toBeNull();
    expect(val('voornaam')).toBe('Mehmet');
    expect(val('stad')).toBe('Gent');
    expect(val('voornaam', travellerCard(0))).toBe('Mehmet');
    expect(val('achternaam', travellerCard(0))).toBe('KAYA');
  });

  it('never keeps a password or card details in the draft', async () => {
    const user = userEvent.setup();
    renderApp();
    fill('voornaam', 'Mehmet', contactFields());
    await user.click(within(document.querySelector('.ck-signin-invite')).getByRole('button', { name: /inloggen/i }));
    const box = await screen.findByRole('dialog', { name: /inloggen en verder boeken/i });
    await user.type(within(box).getByLabelText(/^wachtwoord$/i), 'Zebedee-Quux-731');

    const stored = JSON.stringify({ ...sessionStorage }) + JSON.stringify({ ...localStorage });
    expect(stored).toContain('Mehmet');
    expect(stored).not.toContain('Zebedee-Quux-731');
  });
});

describe('an account session that went stale', () => {
  const signedIn = { isAuthenticated: true, accessToken: 'AT-OLD', user: ACCOUNT };

  it('refreshes once and still fills the form', async () => {
    localStorage.setItem('accessToken', 'AT-OLD');
    localStorage.setItem('refreshToken', 'RT-OLD');
    let meCalls = 0;
    routes({
      onMe: () => (meCalls++ === 0
        ? fail(401, 'jwt expired')
        : ok({ success: true, data: { id: 7, name: ACCOUNT.name, email: ACCOUNT.email, customerProfile: PROFILE } })),
      onRefresh: (body) => (body?.refreshToken === 'RT-OLD' ? ok({ success: true, data: { accessToken: 'AT-FRESH' } }) : fail(401)),
    });
    renderApp({ store: makeStore(signedIn) });

    await waitFor(() => expect(val('stad')).toBe('Antwerpen'));
    expect(localStorage.getItem('accessToken')).toBe('AT-FRESH');
    expect(document.querySelector('.ck-auth-banner')).toHaveTextContent(/ingevuld/i);
  });

  it('drops a session that cannot be refreshed and offers sign-in again', async () => {
    localStorage.setItem('accessToken', 'AT-OLD');
    routes({ onMe: () => fail(401, 'jwt expired') });
    const store = renderApp({ store: makeStore(signedIn) });

    await waitFor(() => expect(store.getState().auth.isAuthenticated).toBe(false));
    expect(document.querySelector('.ck-signin-invite')).toBeTruthy();
    expect(fieldByLabel('e-mailadres', contactFields()).querySelector('input')).not.toHaveAttribute('readonly');
  });
});

describe('signing out with the checkout on screen', () => {
  it('drops the draft instead of handing the account\'s details to the next visitor', async () => {
    const { logout } = await import('../../store/slices/authSlice');
    localStorage.setItem('accessToken', 'AT-1');
    const store = renderApp({ store: makeStore({ isAuthenticated: true, accessToken: 'AT-1', user: ACCOUNT }) });
    await waitFor(() => expect(val('stad')).toBe('Antwerpen'));
    expect(sessionStorage.getItem('sunsky.checkoutDraft.v1')).toContain('Antwerpen');

    act(() => { store.dispatch(logout()); });
    await waitFor(() => expect(sessionStorage.getItem('sunsky.checkoutDraft.v1')).toBeNull());
    // Typing after that does not file it again as a guest's draft.
    fill('stad', 'Gent');
    await new Promise((r) => setTimeout(r, 50));
    expect(sessionStorage.getItem('sunsky.checkoutDraft.v1')).toBeNull();
  });
});
