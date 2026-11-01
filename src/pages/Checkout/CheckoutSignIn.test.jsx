import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../store/slices/authSlice';
import CheckoutSignIn from './CheckoutSignIn';

// An existing customer signing in from the checkout must carry on with the exact booking they
// were making. The dialog signs them in where they are: the session is stored, the store says
// signed in, the checkout is told, and nobody navigates anywhere. The same for a forgotten
// password, which is reset inline and then signs straight in with the new one.

const { showToast, api } = vi.hoisted(() => ({
  showToast: vi.fn(),
  api: {
    loginRequest: vi.fn(),
    requestPasswordReset: vi.fn(),
    submitNewPassword: vi.fn(),
  },
}));

vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));

// The network calls are stubbed; persistSession stays the real one (refresh token in
// localStorage, loginSuccess into the store), so "signed in" below means what it means in the app.
// Should it ever be missing from the module, a stand-in doing the same keeps these tests honest.
vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal();
  const { loginSuccess } = await import('../../store/slices/authSlice');
  return {
    ...actual,
    loginRequest: (...a) => api.loginRequest(...a),
    requestPasswordReset: (...a) => api.requestPasswordReset(...a),
    submitNewPassword: (...a) => api.submitNewPassword(...a),
    persistSession: actual.persistSession ?? ((dispatch, { accessToken, refreshToken, user }) => {
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
      dispatch(loginSuccess({ user, accessToken }));
    }),
  };
});

const BOOKING = { hotelCode: '300984', hotelName: 'Test Hotel', nights: 7 };
const USER = { id: 7, name: 'Ann Peeters', email: 'ann@example.com', role: 'customer', currentRoleId: 3 };
const session = (over = {}) => ({
  data: { success: true, data: { accessToken: 'AT-1', refreshToken: 'RT-1', user: USER, ...over } },
});
const apiFailure = (status, message) => Object.assign(new Error(message || `HTTP ${status}`), {
  response: { status, data: message ? { success: false, message } : {} },
});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

// Where the router is, printed: proof that signing in never moved the page or dropped the trip.
function Where() {
  const loc = useLocation();
  return <output data-testid="where">{`${loc.pathname} ${JSON.stringify(loc.state)}`}</output>;
}

const renderDialog = (props = {}) => {
  const store = configureStore({ reducer: { auth: authReducer } });
  const onClose = vi.fn();
  const onSignedIn = vi.fn();
  const onCreateAccount = vi.fn();
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[{ pathname: '/checkout', state: { booking: BOOKING } }]}>
        <Where />
        <CheckoutSignIn open onClose={onClose} onSignedIn={onSignedIn} onCreateAccount={onCreateAccount} {...props} />
      </MemoryRouter>
    </Provider>,
  );
  const rerender = (next) => view.rerender(
    <Provider store={store}>
      <MemoryRouter initialEntries={[{ pathname: '/checkout', state: { booking: BOOKING } }]}>
        <Where />
        <CheckoutSignIn open onClose={onClose} onSignedIn={onSignedIn} onCreateAccount={onCreateAccount} {...props} {...next} />
      </MemoryRouter>
    </Provider>,
  );
  return { store, onClose, onSignedIn, onCreateAccount, rerender };
};

const dialog = () => screen.getByRole('dialog');
const emailInput = () => within(dialog()).getByLabelText('E-mailadres');
const passwordInput = () => within(dialog()).getByLabelText('Wachtwoord');
const signInButton = () => within(dialog()).getByRole('button', { name: /inloggen en verder/i });
const stillOnCheckout = () => {
  expect(screen.getByTestId('where')).toHaveTextContent('/checkout');
  expect(screen.getByTestId('where')).toHaveTextContent('"hotelCode":"300984"');
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.body.style.overflow = '';
  showToast.mockReset();
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe('the checkout sign-in dialog', () => {
  it('renders nothing while closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a labelled modal dialog that says the booking is safe', () => {
    renderDialog();
    const box = dialog();
    expect(box).toHaveAttribute('aria-modal', 'true');
    expect(box).toHaveAccessibleName('Inloggen en verder boeken');
    expect(box).toHaveAccessibleDescription(/je reis blijft bewaard en wat je al invulde nemen we mee/i);
    expect(box).toHaveClass('ck-si-modal');
    // Never the classes the checkout's own tests take for the passport-name review.
    expect(document.querySelector('.ck-modal')).toBeNull();
    expect(document.querySelector('.ck-check')).toBeNull();
    expect(emailInput()).toHaveAttribute('type', 'email');
    expect(emailInput()).toHaveAttribute('autocomplete', 'email');
    expect(passwordInput()).toHaveAttribute('autocomplete', 'current-password');
  });

  it('prefills the email it was given, trimmed, and starts on the password', () => {
    renderDialog({ initialEmail: '   ann@example.com  ' });
    expect(emailInput()).toHaveValue('ann@example.com');
    expect(passwordInput()).toHaveFocus();
  });

  it('starts on the email when there is none to prefill', () => {
    renderDialog();
    expect(emailInput()).toHaveValue('');
    expect(emailInput()).toHaveFocus();
  });

  it('signs in on the spot: session stored, store signed in, toast, then onSignedIn and onClose, no navigation', async () => {
    const user = userEvent.setup();
    api.loginRequest.mockResolvedValue(session());
    const { store, onClose, onSignedIn } = renderDialog({ initialEmail: ' ann@example.com ' });

    await user.type(passwordInput(), 'Geheim#2026');
    await user.click(within(dialog()).getByLabelText('Blijf ingelogd'));
    await user.click(signInButton());

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(USER));
    expect(api.loginRequest).toHaveBeenCalledTimes(1);
    expect(api.loginRequest).toHaveBeenCalledWith({ email: 'ann@example.com', password: 'Geheim#2026', rememberMe: true });

    expect(localStorage.getItem('accessToken')).toBe('AT-1');
    expect(localStorage.getItem('refreshToken')).toBe('RT-1');
    expect(JSON.parse(localStorage.getItem('user'))).toEqual(USER);
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(store.getState().auth.user).toEqual(USER);

    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/je bent ingelogd/i), 'success');
    expect(onClose).toHaveBeenCalledTimes(1);
    // The checkout hears about the account before the dialog goes.
    expect(onSignedIn.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
    stillOnCheckout();
  });

  it('a wrong password shows the server message, toasts it, stays open and stays signed out', async () => {
    const user = userEvent.setup();
    api.loginRequest.mockRejectedValue(apiFailure(401, 'Invalid email or password'));
    const { store, onClose, onSignedIn } = renderDialog({ initialEmail: 'ann@example.com' });

    await user.type(passwordInput(), 'wrong');
    await user.click(signInButton());

    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent('Invalid email or password');
    expect(showToast).toHaveBeenCalledWith('Invalid email or password', 'error');
    expect(dialog()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    // Ready to try again at once.
    await waitFor(() => expect(signInButton()).toBeEnabled());
    stillOnCheckout();
  });

  it('a failure with no server message falls back to a readable one', async () => {
    const user = userEvent.setup();
    api.loginRequest.mockRejectedValue(new Error('Network Error'));
    renderDialog({ initialEmail: 'ann@example.com' });
    await user.type(passwordInput(), 'Geheim#2026');
    await user.click(signInButton());
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(/inloggen is niet gelukt/i);
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/inloggen is niet gelukt/i), 'error');
  });

  it('checks the fields before sending anything', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(emailInput(), 'not-an-email');
    await user.click(signInButton());
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(/geldig e-mailadres/i);
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/geldig e-mailadres/i), 'error');

    await user.clear(emailInput());
    await user.type(emailInput(), 'ann@example.com');
    await user.click(signInButton());
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(/vul je wachtwoord in/i);
    expect(passwordInput()).toHaveFocus();
    expect(api.loginRequest).not.toHaveBeenCalled();
  });

  it('sends one request however often it is submitted while busy', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    api.loginRequest.mockReturnValue(pending.promise);
    const { onSignedIn } = renderDialog({ initialEmail: 'ann@example.com' });
    await user.type(passwordInput(), 'Geheim#2026');

    // The same button throughout: while busy it is renamed, so it cannot be found by its label.
    const submit = signInButton();
    const form = submit.closest('form');
    // Two submits in the same tick: the second reads the state from before the first set it.
    fireEvent.submit(form);
    fireEvent.submit(form);
    await user.dblClick(submit);
    await user.keyboard('{Enter}');
    expect(api.loginRequest).toHaveBeenCalledTimes(1);

    // Busy: the button says so and is off.
    expect(submit).toHaveAccessibleName(/bezig met inloggen/i);
    expect(submit).toBeDisabled();

    pending.resolve(session());
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(api.loginRequest).toHaveBeenCalledTimes(1);
  });

  it('Escape, the close button and the backdrop close it; the page scrolls again afterwards', async () => {
    const user = userEvent.setup();
    document.body.style.overflow = 'scroll';
    const { onClose, rerender } = renderDialog();
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(within(dialog()).getByRole('button', { name: 'Sluiten' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    // A click inside the card is not a click on the backdrop.
    await user.click(screen.getByText(/je reis blijft bewaard/i));
    expect(onClose).toHaveBeenCalledTimes(2);
    await user.click(document.querySelector('.ck-si-overlay'));
    expect(onClose).toHaveBeenCalledTimes(3);

    rerender({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('gives the page its scroll back when unmounted while open', () => {
    document.body.style.overflow = 'auto';
    const view = render(
      <Provider store={configureStore({ reducer: { auth: authReducer } })}>
        <CheckoutSignIn open onClose={() => {}} />
      </Provider>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    view.unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('does not close while a sign-in is on its way', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    api.loginRequest.mockReturnValue(pending.promise);
    const { onClose } = renderDialog({ initialEmail: 'ann@example.com' });
    await user.type(passwordInput(), 'Geheim#2026');
    await user.click(signInButton());

    await user.keyboard('{Escape}');
    await user.click(document.querySelector('.ck-si-overlay'));
    expect(within(dialog()).getByRole('button', { name: 'Sluiten' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    pending.reject(apiFailure(401, 'Invalid email or password'));
    await within(dialog()).findByRole('alert');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    renderDialog();
    const close = within(dialog()).getByRole('button', { name: 'Sluiten' });
    const createAccount = within(dialog()).getByRole('button', { name: 'Account aanmaken' });
    createAccount.focus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(createAccount).toHaveFocus();
  });

  it('hands the typed email to the checkout to create an account', async () => {
    const user = userEvent.setup();
    const { onCreateAccount } = renderDialog({ initialEmail: 'new@example.com' });
    await user.click(within(dialog()).getByRole('button', { name: 'Account aanmaken' }));
    expect(onCreateAccount).toHaveBeenCalledWith('new@example.com');
  });

  it('shows and hides the password', async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(passwordInput()).toHaveAttribute('type', 'password');
    await user.click(within(dialog()).getByRole('button', { name: 'Wachtwoord tonen' }));
    expect(passwordInput()).toHaveAttribute('type', 'text');
    await user.click(within(dialog()).getByRole('button', { name: 'Wachtwoord verbergen' }));
    expect(passwordInput()).toHaveAttribute('type', 'password');
  });
});

describe('a forgotten password, without leaving the checkout', () => {
  const enterCode = async (user, digits) => {
    const first = within(dialog()).getByRole('textbox', { name: /cijfer 1 van 6/i });
    await user.click(first);
    await user.keyboard(digits);
  };

  it('requests a code, takes it with a new password, and signs straight in with that password', async () => {
    const user = userEvent.setup();
    api.requestPasswordReset.mockResolvedValue({ data: { success: true, data: { email: 'ann@example.com', expiresInMinutes: 15 } } });
    api.submitNewPassword.mockResolvedValue({ data: { success: true } });
    api.loginRequest.mockResolvedValue(session({ accessToken: 'AT-NEW', refreshToken: 'RT-NEW' }));
    const { store, onClose, onSignedIn } = renderDialog({ initialEmail: ' ann@example.com ' });

    // Same dialog, the email carried over.
    await user.click(within(dialog()).getByRole('button', { name: 'Wachtwoord vergeten?' }));
    expect(dialog()).toHaveAccessibleName('Wachtwoord vergeten');
    expect(emailInput()).toHaveValue('ann@example.com');

    await user.click(within(dialog()).getByRole('button', { name: 'Code versturen' }));
    await waitFor(() => expect(api.requestPasswordReset).toHaveBeenCalledWith('ann@example.com'));
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/de code onderweg/i), 'success');

    // Step 2: the code and the new password together.
    await within(dialog()).findByRole('group', { name: /code uit de e-mail/i });
    expect(within(dialog()).getByRole('textbox', { name: /cijfer 1 van 6/i })).toHaveFocus();
    expect(within(dialog()).getByText(/verloopt over 15 minuten/i)).toBeInTheDocument();
    await enterCode(user, '123456');
    await user.type(within(dialog()).getByLabelText('Nieuw wachtwoord'), 'Nieuw#2026');
    await user.type(within(dialog()).getByLabelText('Bevestig nieuw wachtwoord'), 'Nieuw#2026');
    await user.click(within(dialog()).getByRole('button', { name: /opslaan en inloggen/i }));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(USER));
    expect(api.submitNewPassword).toHaveBeenCalledWith('ann@example.com', '123456', 'Nieuw#2026');
    expect(api.loginRequest).toHaveBeenCalledWith({ email: 'ann@example.com', password: 'Nieuw#2026', rememberMe: false });
    expect(api.submitNewPassword.mock.invocationCallOrder[0]).toBeLessThan(api.loginRequest.mock.invocationCallOrder[0]);

    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(localStorage.getItem('accessToken')).toBe('AT-NEW');
    expect(localStorage.getItem('refreshToken')).toBe('RT-NEW');
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/wachtwoord is gewijzigd en je bent ingelogd/i), 'success');
    expect(onClose).toHaveBeenCalledTimes(1);
    stillOnCheckout();
  });

  it('can open straight on the reset', () => {
    renderDialog({ initialMode: 'forgot', initialEmail: 'ann@example.com' });
    expect(dialog()).toHaveAccessibleName('Wachtwoord vergeten');
    expect(within(dialog()).getByRole('button', { name: 'Code versturen' })).toHaveFocus();
  });

  it('holds back a new password that breaks the rules or does not match', async () => {
    const user = userEvent.setup();
    api.requestPasswordReset.mockResolvedValue({ data: { data: { expiresInMinutes: 15 } } });
    renderDialog({ initialMode: 'forgot', initialEmail: 'ann@example.com' });
    await user.click(within(dialog()).getByRole('button', { name: 'Code versturen' }));
    await within(dialog()).findByRole('group', { name: /code uit de e-mail/i });

    const save = () => user.click(within(dialog()).getByRole('button', { name: /opslaan en inloggen/i }));
    await save();
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(/6-cijferige code/i);

    await enterCode(user, '123456');
    await user.type(within(dialog()).getByLabelText('Nieuw wachtwoord'), 'short');
    await save();
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(/voldoet nog niet aan alle eisen/i);

    await user.clear(within(dialog()).getByLabelText('Nieuw wachtwoord'));
    await user.type(within(dialog()).getByLabelText('Nieuw wachtwoord'), 'Nieuw#2026');
    await user.type(within(dialog()).getByLabelText('Bevestig nieuw wachtwoord'), 'Nieuw#2027');
    await save();
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(/niet gelijk/i);
    expect(api.submitNewPassword).not.toHaveBeenCalled();
  });

  it('a wrong code says so and keeps the customer on the reset', async () => {
    const user = userEvent.setup();
    api.requestPasswordReset.mockResolvedValue({ data: { data: { expiresInMinutes: 15 } } });
    api.submitNewPassword.mockRejectedValue(apiFailure(400, 'That code is incorrect. Please check and try again.'));
    const { onSignedIn } = renderDialog({ initialMode: 'forgot', initialEmail: 'ann@example.com' });
    await user.click(within(dialog()).getByRole('button', { name: 'Code versturen' }));
    await within(dialog()).findByRole('group', { name: /code uit de e-mail/i });
    await enterCode(user, '999999');
    await user.type(within(dialog()).getByLabelText('Nieuw wachtwoord'), 'Nieuw#2026');
    await user.type(within(dialog()).getByLabelText('Bevestig nieuw wachtwoord'), 'Nieuw#2026');
    await user.click(within(dialog()).getByRole('button', { name: /opslaan en inloggen/i }));

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('That code is incorrect');
    expect(showToast).toHaveBeenCalledWith('That code is incorrect. Please check and try again.', 'error');
    expect(api.loginRequest).not.toHaveBeenCalled();
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole('group', { name: /code uit de e-mail/i })).toBeInTheDocument();
  });

  it('shows the server message when the code request is refused (rate limit)', async () => {
    const user = userEvent.setup();
    api.requestPasswordReset.mockRejectedValue(apiFailure(429, 'Too many requests. Please try again in 15 minutes.'));
    renderDialog({ initialMode: 'forgot', initialEmail: 'ann@example.com' });
    await user.click(within(dialog()).getByRole('button', { name: 'Code versturen' }));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Too many requests');
    expect(showToast).toHaveBeenCalledWith('Too many requests. Please try again in 15 minutes.', 'error');
  });

  it('when the automatic sign-in fails, goes back to sign in with the email filled and says why', async () => {
    const user = userEvent.setup();
    api.requestPasswordReset.mockResolvedValue({ data: { data: { expiresInMinutes: 15 } } });
    api.submitNewPassword.mockResolvedValue({ data: { success: true } });
    api.loginRequest
      .mockRejectedValueOnce(apiFailure(429, 'Too many login attempts'))
      .mockResolvedValueOnce(session());
    const { store, onSignedIn } = renderDialog({ initialMode: 'forgot', initialEmail: 'ann@example.com' });
    await user.click(within(dialog()).getByRole('button', { name: 'Code versturen' }));
    await within(dialog()).findByRole('group', { name: /code uit de e-mail/i });
    await enterCode(user, '123456');
    await user.type(within(dialog()).getByLabelText('Nieuw wachtwoord'), 'Nieuw#2026');
    await user.type(within(dialog()).getByLabelText('Bevestig nieuw wachtwoord'), 'Nieuw#2026');
    await user.click(within(dialog()).getByRole('button', { name: /opslaan en inloggen/i }));

    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent(/je wachtwoord is gewijzigd, maar automatisch inloggen lukte niet/i);
    expect(showToast).toHaveBeenCalledWith('Too many login attempts', 'error');
    expect(dialog()).toHaveAccessibleName('Inloggen en verder boeken');
    expect(emailInput()).toHaveValue('ann@example.com');
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(onSignedIn).not.toHaveBeenCalled();

    // The new password is already in place: trying again is one press.
    expect(signInButton()).toHaveFocus();
    await user.click(signInButton());
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(USER));
    expect(api.loginRequest).toHaveBeenLastCalledWith({ email: 'ann@example.com', password: 'Nieuw#2026', rememberMe: false });
  });

  it('"back to sign in" returns to the sign-in view with the email kept', async () => {
    const user = userEvent.setup();
    renderDialog({ initialEmail: 'ann@example.com' });
    await user.click(within(dialog()).getByRole('button', { name: 'Wachtwoord vergeten?' }));
    await user.click(within(dialog()).getByRole('button', { name: /terug naar inloggen/i }));
    expect(dialog()).toHaveAccessibleName('Inloggen en verder boeken');
    expect(emailInput()).toHaveValue('ann@example.com');
    expect(passwordInput()).toHaveFocus();
  });
});
