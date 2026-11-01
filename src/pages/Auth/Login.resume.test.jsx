import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../store/slices/authSlice';
import PublicRoute from '../../components/PublicRoute';
import ProtectedRoute from '../../components/ProtectedRoute';
import { clearBrandLogoCache } from '../../hooks/useBrandLogo';
import Login from './Login';
import Register from './Register';
import ForgotPassword from './ForgotPassword';

// A customer who signs in from the checkout must land back on the checkout with the trip they
// were booking. The trip lives in router state, so anything that navigates without it, or that
// navigates AFTER the sign-in did, sends them to an empty "nothing to check out" page.
//
// The real thing on purpose: the real auth reducer, the real PublicRoute wrapped around the
// real pages exactly as AppRouter does, the real useAuthSuccess. The bug this guards against
// was a race between two navigations (PublicRoute's redirect and the login's own), which a
// mocked navigate() cannot see.

const http = vi.hoisted(() => ({ call: null, post: null, get: null }));
// The default export is CALLED as a function by useApi (an axios instance is callable), and
// used as an object by the imperative helpers and the logo's shared GET, so it is both.
vi.mock('../../services/axiosInstance', () => {
  http.call = vi.fn(() => Promise.resolve({ data: {} }));
  http.post = vi.fn(() => Promise.resolve({ data: {} }));
  http.get = vi.fn(() => Promise.resolve({ data: {} }));
  const instance = (...a) => http.call(...a);
  instance.post = (...a) => http.post(...a);
  instance.get = (...a) => http.get(...a);
  return { default: instance, SUPPLIER_TIMEOUT: 25000 };
});
const showToast = vi.fn();
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));

const BOOKING = { hotelCode: '300984', hotelName: 'Test Hotel', nights: 7, ppPrice: 600 };
const FROM_CHECKOUT = { from: '/checkout', resume: { booking: BOOKING } };

const SESSION = {
  success: true,
  data: {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 7, name: 'Ali Test', email: 'ali@example.com', role: 'customer', currentRoleId: 3 },
  },
};

// Where the router ended up, and with what state. Rendered on every non-auth route.
function Probe() {
  const location = useLocation();
  return (
    <div data-testid="probe" data-path={location.pathname}>
      {JSON.stringify(location.state ?? null)}
    </div>
  );
}

const renderAt = (entry) => {
  const store = configureStore({ reducer: { auth: authReducer } });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
          <Route path="/checkout" element={<Probe />} />
          <Route path="/account/bookings" element={<Probe />} />
          <Route path="/" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
  return store;
};

// Waits for the router to SETTLE on a page, not merely pass through it: a second navigation
// landing a tick later is exactly the bug, so the probe has to stay put.
const settledOn = async (path) => {
  const probe = await screen.findByTestId('probe');
  await waitFor(() => expect(screen.getByTestId('probe')).toHaveAttribute('data-path', path));
  await new Promise((r) => setTimeout(r, 30));
  expect(screen.getByTestId('probe')).toHaveAttribute('data-path', path);
  return probe;
};
const probedState = () => JSON.parse(screen.getByTestId('probe').textContent);

const signIn = async (user, { email = 'ali@example.com', password = 'Secret123!' } = {}) => {
  const emailInput = screen.getByLabelText('E-mailadres');
  await user.clear(emailInput);
  await user.type(emailInput, email);
  await user.type(screen.getByLabelText('Wachtwoord'), password);
  await user.click(screen.getByRole('button', { name: 'Inloggen' }));
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearBrandLogoCache();
  showToast.mockReset();
  http.post.mockReset().mockImplementation(() => Promise.resolve({ data: {} }));
  http.get.mockReset().mockImplementation(() => Promise.resolve({ data: {} }));
  http.call.mockReset().mockImplementation((config) => (
    String(config?.url).includes('/website/auth/login')
      ? Promise.resolve({ data: SESSION })
      : Promise.resolve({ data: {} })
  ));
});

describe('signing in from the checkout', () => {
  it('lands back on the checkout with the booking, not on the home page', async () => {
    const user = userEvent.setup();
    const store = renderAt({ pathname: '/login', state: FROM_CHECKOUT });

    await signIn(user);

    await settledOn('/checkout');
    expect(probedState()).toEqual({ booking: BOOKING });
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(localStorage.getItem('accessToken')).toBe('access-1');
    expect(localStorage.getItem('refreshToken')).toBe('refresh-1');
  });

  it('sends a trimmed email to the API', async () => {
    const user = userEvent.setup();
    renderAt({ pathname: '/login', state: FROM_CHECKOUT });

    await signIn(user, { email: '  ali@example.com  ' });

    await settledOn('/checkout');
    const loginCall = http.call.mock.calls.find(([c]) => String(c?.url).includes('/website/auth/login'));
    expect(loginCall[0].data).toEqual({ email: 'ali@example.com', password: 'Secret123!', rememberMe: false });
  });

  it('says the sign-in carries on with the booking', async () => {
    renderAt({ pathname: '/login', state: FROM_CHECKOUT });
    expect(await screen.findByText('Log in en ga verder met je boeking.')).toBeInTheDocument();
  });

  it('prefills the email the checkout already had', async () => {
    renderAt({ pathname: '/login', state: { ...FROM_CHECKOUT, resume: { booking: BOOKING, email: 'ali@example.com' } } });
    expect(await screen.findByLabelText('E-mailadres')).toHaveValue('ali@example.com');
  });

  it('keeps the booking through forgot password and back again', async () => {
    const user = userEvent.setup();
    renderAt({ pathname: '/login', state: FROM_CHECKOUT });

    await user.click(await screen.findByRole('link', { name: 'Wachtwoord vergeten?' }));
    await user.click(await screen.findByRole('link', { name: 'Terug naar inloggen' }));
    // Still the checkout's sign-in, so the line saying so is still there.
    expect(await screen.findByText('Log in en ga verder met je boeking.')).toBeInTheDocument();

    await signIn(user);

    await settledOn('/checkout');
    expect(probedState()).toEqual({ booking: BOOKING });
  });

  it('keeps the booking through register and back to sign in', async () => {
    const user = userEvent.setup();
    renderAt({ pathname: '/login', state: FROM_CHECKOUT });

    await user.click(await screen.findByRole('link', { name: 'Maak er gratis een aan' }));
    await user.click(await screen.findByRole('link', { name: 'Inloggen' }));

    await signIn(user);

    await settledOn('/checkout');
    expect(probedState()).toEqual({ booking: BOOKING });
  });

  it('goes back to the checkout with the booking when the visitor continues as a guest', async () => {
    const user = userEvent.setup();
    renderAt({ pathname: '/login', state: FROM_CHECKOUT });

    await user.click(await screen.findByRole('button', { name: 'Doorgaan als gast' }));

    await settledOn('/checkout');
    expect(probedState()).toEqual({ booking: BOOKING });
  });

  it('goes back to the checkout with the booking from register too', async () => {
    const user = userEvent.setup();
    renderAt({ pathname: '/register', state: FROM_CHECKOUT });

    await user.click(await screen.findByRole('button', { name: 'Doorgaan als gast' }));

    await settledOn('/checkout');
    expect(probedState()).toEqual({ booking: BOOKING });
  });
});

describe('the forgot password page, opened from the checkout', () => {
  it('hands the reset email to sign in, which then still returns to the checkout', async () => {
    const user = userEvent.setup();
    http.post.mockImplementation((url) => (
      String(url).includes('forgot-password')
        ? Promise.resolve({ data: { success: true, data: { expiresInMinutes: 15 } } })
        : Promise.resolve({ data: { success: true } })
    ));
    renderAt({ pathname: '/forgot-password', state: { ...FROM_CHECKOUT, resume: { booking: BOOKING, email: 'ali@example.com' } } });

    // Prefilled from the checkout, so step 1 is one click.
    expect(await screen.findByLabelText('E-mailadres')).toHaveValue('ali@example.com');
    await user.click(screen.getByRole('button', { name: 'Resetcode versturen' }));

    const digits = await screen.findAllByRole('textbox');
    await user.click(digits[0]);
    await user.paste('123456');
    await user.click(screen.getByRole('button', { name: 'Code verifiëren' }));

    await user.type(await screen.findByLabelText('Nieuw wachtwoord'), 'Newpass1!');
    await user.type(screen.getByLabelText('Bevestig wachtwoord'), 'Newpass1!');
    await user.click(screen.getByRole('button', { name: 'Wachtwoord bijwerken' }));

    await user.click(await screen.findByRole('button', { name: 'Ga naar inloggen' }));

    // On sign in with the address already in, then on to the checkout.
    expect(await screen.findByLabelText('E-mailadres')).toHaveValue('ali@example.com');
    await user.type(screen.getByLabelText('Wachtwoord'), 'Newpass1!');
    await user.click(screen.getByRole('button', { name: 'Inloggen' }));

    await settledOn('/checkout');
    expect(probedState()).toEqual({ booking: BOOKING, email: 'ali@example.com' });
  });
});

describe('a page that needs an account', () => {
  const renderProtected = () => {
    const store = configureStore({ reducer: { auth: authReducer } });
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/account/favourites']}>
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/account/favourites" element={<ProtectedRoute><Probe /></ProtectedRoute>} />
            <Route path="/" element={<Probe />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );
  };

  it('is where the sign-in it asked for returns to', async () => {
    const user = userEvent.setup();
    renderProtected();

    await screen.findByRole('button', { name: 'Inloggen' });
    await signIn(user);

    await settledOn('/account/favourites');
  });

  it('is not where a guest is sent, since it would only send them back to sign in', async () => {
    const user = userEvent.setup();
    renderProtected();

    await user.click(await screen.findByRole('button', { name: 'Doorgaan als gast' }));

    await settledOn('/');
  });
});

describe('signing in without a page to go back to', () => {
  it('a plain sign-in from the header still ends on my bookings', async () => {
    const user = userEvent.setup();
    renderAt({ pathname: '/login' });

    // Nothing to resume, so no line about a booking.
    await screen.findByRole('button', { name: 'Inloggen' });
    expect(screen.queryByText('Log in en ga verder met je boeking.')).not.toBeInTheDocument();

    await signIn(user);

    await settledOn('/account/bookings');
    expect(probedState()).toBeNull();
  });

  it('continue as guest goes home', async () => {
    const user = userEvent.setup();
    renderAt({ pathname: '/login' });

    await user.click(await screen.findByRole('button', { name: 'Doorgaan als gast' }));

    await settledOn('/');
  });
});
