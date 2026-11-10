import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import PayBalance from './PayBalance';

const post = vi.fn();
vi.mock('../../services/axiosInstance', () => ({ default: { post: (...a) => post(...a) } }));
const showToast = vi.fn();
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));

const BOOKING = {
  id: 77, bookingReference: 'ORD-000377', status: 'Confirmed', paymentStatus: 'Partial', paymentPlan: 'deposit',
  grandTotal: 1026.04, paidAmount: 410, balanceAmount: 616.04, depositAmount: 410,
  balanceDueDate: '2099-07-21', canPayBalance: true, customerEmail: 'anna@example.com', customerName: 'Anna Peeters',
};

beforeAll(async () => { await act(async () => { await i18n.changeLanguage('en'); }); });
afterAll(async () => { await act(async () => { await i18n.changeLanguage('nl'); }); });
beforeEach(() => { post.mockReset(); showToast.mockReset(); });

describe('PayBalance', () => {
  it('speaks Dutch too', async () => {
    await act(async () => { await i18n.changeLanguage('nl'); });
    render(<PayBalance booking={BOOKING} />);
    expect(screen.getByText('Saldo te betalen uiterlijk 21/07/2099')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Saldo betalen/ })).toBeInTheDocument();
    await act(async () => { await i18n.changeLanguage('en'); });
  });

  it('shows nothing when there is no balance the customer may pay online', () => {
    const { container } = render(<PayBalance booking={{ ...BOOKING, canPayBalance: false }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says what is due and by when, in the house formats', () => {
    render(<PayBalance booking={BOOKING} />);
    expect(screen.getByText('Balance due by 21/07/2099')).toBeInTheDocument();
    expect(screen.getByText('€616,04')).toBeInTheDocument();
  });

  it('an overdue balance says so', () => {
    render(<PayBalance booking={{ ...BOOKING, balanceDueDate: '2020-01-31' }} />);
    expect(screen.getByText('Your balance was due on 31/01/2020')).toBeInTheDocument();
    expect(screen.getByText(/Please pay the rest as soon as possible/)).toBeInTheDocument();
  });

  it('pays on a test server without Stripe, toasts, and lets the page read the booking again', async () => {
    post.mockImplementation((url) => {
      if (url.endsWith('/create-payment-intent')) {
        return Promise.reject({ response: { data: { errorCode: 'STRIPE_NOT_CONFIGURED' } } });
      }
      return Promise.resolve({ data: { data: { paymentStatus: 'Paid', purpose: 'balance' } } });
    });
    const onPaid = vi.fn();
    render(<PayBalance booking={BOOKING} onPaid={onPaid} />);

    await userEvent.click(screen.getByRole('button', { name: /Pay balance/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Pay €616,04' }));

    await waitFor(() => expect(onPaid).toHaveBeenCalled());
    expect(post).toHaveBeenNthCalledWith(1, '/website/online-bookings/77/create-payment-intent');
    expect(post).toHaveBeenNthCalledWith(2, '/website/online-bookings/77/payment', { mode: 'test' });
    expect(showToast).toHaveBeenCalledWith('Thank you! Your balance is paid.', 'success');
  });

  it('a refusal is shown on the form and toasted, and nothing is recorded', async () => {
    post.mockRejectedValue({ response: { data: { message: 'Nothing is left to pay on this booking', errorCode: 'NOTHING_DUE' } } });
    render(<PayBalance booking={BOOKING} />);
    await userEvent.click(screen.getByRole('button', { name: /Pay balance/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Pay €616,04' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing is left to pay on this booking');
    expect(showToast).toHaveBeenCalledWith('Nothing is left to pay on this booking', 'error');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('Cancel closes the form', async () => {
    render(<PayBalance booking={BOOKING} />);
    await userEvent.click(screen.getByRole('button', { name: /Pay balance/ }));
    expect(screen.getByRole('radiogroup', { name: 'Payment method' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('radiogroup', { name: 'Payment method' })).toBeNull();
  });
});
