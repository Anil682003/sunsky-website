import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { loginSuccess } from '../store/slices/authSlice';
import PublicRoute from './PublicRoute';

// Somebody who SIGNS IN on a sign-in page is sent on to the page that sent them there, with
// what it needs to carry on. Somebody who arrives ALREADY signed in (a bookmark, the back
// button onto an old /login entry) goes home, whatever that old entry carried: following it
// could put them back into a checkout they have since paid for. The full sign-in flow is
// covered end to end in pages/Auth/Login.resume.test.jsx.

// PublicRoute reads its helpers from api/index.js, which loads the shared HTTP client.
vi.mock('../services/axiosInstance', () => {
  const instance = vi.fn(() => Promise.resolve({ data: {} }));
  instance.post = vi.fn(() => Promise.resolve({ data: {} }));
  instance.get = vi.fn(() => Promise.resolve({ data: {} }));
  return { default: instance, SUPPLIER_TIMEOUT: 25000 };
});

function Probe() {
  const location = useLocation();
  return (
    <div data-testid="probe" data-path={location.pathname} data-search={location.search}>
      {JSON.stringify(location.state ?? null)}
    </div>
  );
}

const renderAt = (entry, { signedIn }) => {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: signedIn
        ? { isAuthenticated: true, accessToken: 'access-1', user: { id: 7, name: 'Ali Test' } }
        : { isAuthenticated: false, accessToken: null, user: null },
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/login" element={<PublicRoute><p>the sign-in form</p></PublicRoute>} />
          <Route path="/checkout" element={<Probe />} />
          <Route path="/account/bookings" element={<Probe />} />
          <Route path="/" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
  return store;
};

// Signing in while the sign-in page is open, as the form does.
const signInHere = (store) => act(() => {
  store.dispatch(loginSuccess({ user: { id: 7, name: 'Ali Test' }, accessToken: 'access-1' }));
});

const landedOn = async (path) => {
  await waitFor(() => expect(screen.getByTestId('probe')).toHaveAttribute('data-path', path));
  return JSON.parse(screen.getByTestId('probe').textContent);
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('PublicRoute', () => {
  it('shows the page to somebody who is not signed in', () => {
    renderAt({ pathname: '/login', state: { from: '/checkout', resume: { booking: { id: 1 } } } }, { signedIn: false });
    expect(screen.getByText('the sign-in form')).toBeInTheDocument();
  });

  it('sends somebody already signed in home when nothing sent them', async () => {
    renderAt('/login', { signedIn: true });
    expect(await landedOn('/')).toBeNull();
  });

  it('sends somebody who signs in here back to the checkout with its booking', async () => {
    const booking = { hotelCode: '300984', nights: 7 };
    const store = renderAt({ pathname: '/login', state: { from: '/checkout', resume: { booking } } }, { signedIn: false });
    signInHere(store);
    expect(await landedOn('/checkout')).toEqual({ booking });
  });

  it('sends somebody who arrives already signed in home, not into an old checkout', async () => {
    const booking = { hotelCode: '300984', nights: 7 };
    renderAt({ pathname: '/login', state: { from: '/checkout', resume: { booking } } }, { signedIn: true });
    expect(await landedOn('/')).toBeNull();
  });

  it('follows a whole Location as ProtectedRoute hands it over, query and all', async () => {
    const from = { pathname: '/account/bookings', search: '?tab=past', hash: '', state: null, key: 'abc' };
    const store = renderAt({ pathname: '/login', state: { from } }, { signedIn: false });
    signInHere(store);
    expect(await landedOn('/account/bookings')).toBeNull();
    expect(screen.getByTestId('probe')).toHaveAttribute('data-search', '?tab=past');
  });

  it('does not follow anything that is not a path on this site', async () => {
    const store = renderAt({ pathname: '/login', state: { from: '//evil.example/checkout' } }, { signedIn: false });
    signInHere(store);
    expect(await landedOn('/account/bookings')).toBeNull();
  });
});
