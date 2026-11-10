import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { CalendarClock, CreditCard, Lock } from 'lucide-react';
import axiosInstance from '../../services/axiosInstance';
import { useToast } from '../../context/ToastContext';
import i18n from '../../i18n';
import styles from './PayBalance.module.css';

/**
 * "Pay balance" on a deposit booking (My Bookings → booking).
 *
 * The deposit was paid at checkout; this pays what is left. The server decides the amount: the
 * intent it creates for a Partial booking is the outstanding balance, with purpose `balance`, and
 * recording it settles the booking to Paid. Nothing here names an amount the server would charge.
 * Card is paid on this page; Bancontact, iDEAL and PayPal go to the bank and come back to
 * /checkout/return?purpose=balance, which records the payment without confirming the trip again.
 */

const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
const PAYMENT_MODE = import.meta.env.VITE_PAYMENT_MODE || 'test';
// Loaded on first use, so My Bookings does not pull Stripe in for a customer with nothing to pay.
let stripePromise;
const getStripe = () => {
  if (stripePromise === undefined) {
    stripePromise = STRIPE_PK && !STRIPE_PK.includes('REPLACE') ? loadStripe(STRIPE_PK) : null;
  }
  return stripePromise;
};

const STRIPE_STYLE = {
  base: {
    fontSize: '14px',
    color: '#1a2744',
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    '::placeholder': { color: '#94a3bf' },
    lineHeight: '22px',
  },
  invalid: { color: '#ef4444', iconColor: '#ef4444' },
};

// House format whatever the browser: €1.012,60.
const fmt = (n) => `€${Number(n || 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// dd/mm/yyyy from the YYYY-MM-DD text, so no time zone can move the day.
const fmtDmy = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};
const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const METHODS = [
  { id: 'card', logo: <span className={styles.cards}><i className={styles.visa}>VISA</i><i className={styles.mc}><b /><b /></i></span> },
  { id: 'bancontact', logo: <span className={styles.bc}>B<i>ancontact</i></span> },
  { id: 'ideal', logo: <span className={styles.ideal}>iDEAL</span> },
  { id: 'paypal', logo: <span className={styles.pp}>Pay<i>Pal</i></span> },
];

function PayForm({ booking, balance, onPaid, onCancel, stripe, elements }) {
  const { t } = useTranslation('account');
  const { showToast } = useToast();
  const [method, setMethod] = useState('card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const methodLabel = (id) => ({
    card: t('account:payBalance.method.card', 'Card'),
    bancontact: 'Bancontact',
    ideal: 'iDEAL',
    paypal: 'PayPal',
  }[id]);

  const pay = async () => {
    setBusy(true);
    setError('');
    try {
      // 1. The intent: the server works out the balance and tags it as a balance payment.
      let clientSecret = null;
      try {
        const res = await axiosInstance.post(`/website/online-bookings/${booking.id}/create-payment-intent`);
        clientSecret = res?.data?.data?.clientSecret || null;
      } catch (err) {
        // A test server without Stripe pays with the dummy payment below; live never does.
        if (!(PAYMENT_MODE !== 'live' && err?.response?.data?.errorCode === 'STRIPE_NOT_CONFIGURED')) throw err;
      }

      if (clientSecret) {
        if (!stripe || !elements) {
          throw new Error(t('account:payBalance.unavailable', 'Online payment is not available right now. Please try again later.'));
        }
        const billing_details = { name: booking.customerName || undefined, email: booking.customerEmail || undefined };
        if (method === 'card') {
          const { error: cardError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
            payment_method: { card: elements.getElement(CardNumberElement), billing_details },
          });
          if (cardError) throw new Error(cardError.message);
          if (paymentIntent?.status !== 'succeeded') {
            throw new Error(t('account:payBalance.notCompleted', 'The payment was not completed. You have not been charged.'));
          }
          // 2. Record it: the server checks the intent with Stripe before it counts.
          await axiosInstance.post(`/website/online-bookings/${booking.id}/payment`, { paymentIntentId: paymentIntent.id });
        } else {
          const returnUrl = `${window.location.origin}/checkout/return`
            + `?bookingId=${encodeURIComponent(booking.id)}&mode=${encodeURIComponent(PAYMENT_MODE)}&purpose=balance`;
          let res;
          if (method === 'bancontact') {
            res = await stripe.confirmBancontactPayment(clientSecret, { payment_method: { billing_details }, return_url: returnUrl });
          } else if (method === 'ideal') {
            res = await stripe.confirmIdealPayment(clientSecret, { payment_method: { billing_details }, return_url: returnUrl });
          } else {
            res = await stripe.confirmPayPalPayment(clientSecret, { return_url: returnUrl });
          }
          // Only reached when Stripe could not start the redirect.
          if (res?.error) throw new Error(res.error.message);
          return;
        }
      } else {
        if (method !== 'card') {
          throw new Error(t('account:payBalance.methodUnavailable', 'This payment method is not available right now. Please pay by card.'));
        }
        await axiosInstance.post(`/website/online-bookings/${booking.id}/payment`, { mode: 'test' });
      }

      showToast(t('account:payBalance.paid', 'Thank you! Your balance is paid.'), 'success');
      onPaid?.();
    } catch (err) {
      const message = err?.response?.data?.message || err?.message
        || t('account:payBalance.failed', 'The payment failed. Please try again.');
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.form}>
      <div className={styles.methods} role="radiogroup" aria-label={t('account:payBalance.methodTitle', 'Payment method')}>
        {METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={method === m.id}
            className={`${styles.method} ${method === m.id ? styles.methodOn : ''}`}
            onClick={() => { setMethod(m.id); setError(''); }}
          >
            {m.logo}
            <span className={styles.methodLabel}>{methodLabel(m.id)}</span>
          </button>
        ))}
      </div>

      {method === 'card' && stripe && (
        <div className={styles.cardFields}>
          <label className={styles.field}>
            <span>{t('account:payBalance.cardNumber', 'Card number')}</span>
            <div className={styles.stripeBox}><CardNumberElement options={{ style: STRIPE_STYLE, showIcon: true }} /></div>
          </label>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span>{t('account:payBalance.expiry', 'Expiry date')}</span>
              <div className={styles.stripeBox}><CardExpiryElement options={{ style: STRIPE_STYLE }} /></div>
            </label>
            <label className={styles.field}>
              <span>{t('account:payBalance.cvc', 'CVC')}</span>
              <div className={styles.stripeBox}><CardCvcElement options={{ style: STRIPE_STYLE }} /></div>
            </label>
          </div>
        </div>
      )}
      {method !== 'card' && (
        <p className={styles.redirectNote}>
          {t('account:payBalance.redirectNote', { method: methodLabel(method), defaultValue: 'You will be taken to {{method}} to approve the payment, then brought back here.' })}
        </p>
      )}

      {error && <div className={styles.error} role="alert">{error}</div>}

      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
          {t('account:payBalance.cancel', 'Cancel')}
        </button>
        <button type="button" className={styles.payBtn} onClick={pay} disabled={busy} aria-busy={busy}>
          {busy ? <span className={styles.spin} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
          {busy
            ? t('account:payBalance.paying', 'Paying…')
            : t('account:payBalance.payAmount', { amount: fmt(balance), defaultValue: 'Pay {{amount}}' })}
        </button>
      </div>
    </div>
  );
}

function PayFormWithStripe(props) {
  const stripe = useStripe();
  const elements = useElements();
  return <PayForm {...props} stripe={stripe} elements={elements} />;
}

/**
 * @param booking  the My Bookings detail ({ id, canPayBalance, balanceAmount, balanceDueDate, ... })
 * @param onPaid   called after a card payment is recorded, to read the booking again
 */
export default function PayBalance({ booking, onPaid }) {
  const { t } = useTranslation('account');
  const [open, setOpen] = useState(false);
  const balance = Number(booking?.balanceAmount) || 0;
  if (!booking?.canPayBalance || !(balance > 0)) return null;

  const due = booking.balanceDueDate ? String(booking.balanceDueDate).slice(0, 10) : '';
  const overdue = due && due < todayYmd();
  const stripe = open ? getStripe() : null;

  const form = { booking, balance, onPaid: () => { setOpen(false); onPaid?.(); }, onCancel: () => setOpen(false) };

  return (
    <div className={`${styles.box} ${overdue ? styles.overdue : ''}`}>
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden="true"><CalendarClock size={20} /></span>
        <div className={styles.headText}>
          <b>
            {due
              ? (overdue
                ? t('account:payBalance.overdueTitle', { date: fmtDmy(due), defaultValue: 'Your balance was due on {{date}}' })
                : t('account:payBalance.dueTitle', { date: fmtDmy(due), defaultValue: 'Balance due by {{date}}' }))
              : t('account:payBalance.title', 'Balance to pay')}
          </b>
          <span>
            {overdue
              ? t('account:payBalance.subOverdue', 'Your deposit is in. Please pay the rest as soon as possible.')
              : due
                ? t('account:payBalance.sub', 'Your deposit is in. Pay the rest securely online at any time before then.')
                : t('account:payBalance.subNoDate', 'Your deposit is in. Pay the rest securely online before you travel.')}
          </span>
        </div>
        <div className={styles.amount}>{fmt(balance)}</div>
        {!open && (
          <button type="button" className={styles.openBtn} onClick={() => setOpen(true)}>
            <CreditCard size={15} aria-hidden="true" /> {t('account:payBalance.open', 'Pay balance')}
          </button>
        )}
      </div>

      {open && (
        stripe
          ? (
            <Elements stripe={stripe} options={{ locale: i18n.language === 'nl' ? 'nl' : 'en' }}>
              <PayFormWithStripe {...form} />
            </Elements>
          )
          : <PayForm {...form} stripe={null} elements={null} />
      )}
    </div>
  );
}
