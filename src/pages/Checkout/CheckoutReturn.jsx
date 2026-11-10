import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axiosInstance from '../../services/axiosInstance';
import { bookingTokenFor } from '../../services/bookingAccess';
import { trackPurchase, readPurchaseContext, clearPurchaseContext } from '../../analytics';
import { clearDraft } from '../../utils/checkoutDraft';
import { formatEuros, PRICE_KIND } from '../../utils/tripPrice';

// "2027-01-27" → "27/01/2027".
const dmy = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};
const euros = (n) => `€${formatEuros(Number(n) || 0, PRICE_KIND.SELLING) ?? '0'}`;

/**
 * Redirect-payment return page  (route: /checkout/return)
 *
 * Redirect-based methods (Bancontact / iDEAL / PayPal) send the customer away to
 * their bank / PayPal and back here. The same page finishes the BALANCE of a deposit booking
 * paid from My Bookings (`purpose=balance`): that payment only settles the money, the trip was
 * reserved when the deposit was paid, so it is not confirmed with the suppliers again. Stripe appends `payment_intent` and
 * `redirect_status` to the URL; we added `bookingId` and `mode`. This page:
 *   1. records the payment on the backend (which re-verifies the PaymentIntent),
 *   2. reserves with suppliers + confirms the booking,
 *   3. shows the result.
 * The Stripe webhook is the safety net if the customer never lands here.
 */
export default function CheckoutReturn() {
  const { t } = useTranslation('checkout');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);
  const [state, setState] = useState({ status: 'working', message: t('checkout:return.finalising', 'Finalising your payment…'), booking: null });

  useEffect(() => {
    if (ran.current) return; // guard against React StrictMode double-invoke
    ran.current = true;

    const bookingId = params.get('bookingId');
    const mode = params.get('mode') || 'test';
    const paymentIntentId = params.get('payment_intent');
    const redirectStatus = params.get('redirect_status');
    const balanceRun = params.get('purpose') === 'balance';

    // Anything but a definite failure means the money may have moved: the typed checkout for
    // this trip goes at once, before any request that could be cut short by the visitor leaving.
    // A failed payment keeps it, so trying again does not mean typing everything again.
    if (redirectStatus !== 'failed') clearDraft();

    (async () => {
      if (!bookingId) {
        setState({ status: 'error', message: t('checkout:return.missingRef', 'Missing booking reference in the return URL.'), booking: null });
        return;
      }
      if (redirectStatus === 'failed') {
        setState({ status: 'error', message: t('checkout:return.notCompleted', 'The payment was not completed. You have not been charged.'), booking: null });
        return;
      }

      // The booking opens only for its signed-in owner or with its access token, which the
      // checkout kept in this browser (services/bookingAccess). Without either (the bank sent
      // the customer back into a different browser), we cannot finalise from here, but the
      // payment is not lost: the Stripe webhook records it and the confirmation follows by
      // email. Say that, rather than show an error for a payment that went through.
      let signedIn = false;
      try { signedIn = Boolean(window.localStorage.getItem('accessToken')); } catch { /* blocked storage */ }
      if (!bookingTokenFor(bookingId) && !signedIn) {
        setState({ status: 'pending', message: t('checkout:return.processing', 'Your payment is being processed. We will email your confirmation as soon as it clears.'), booking: null });
        return;
      }

      // 1) Record the payment — the backend re-verifies the PaymentIntent with Stripe.
      let paid = null;
      try {
        const res = await axiosInstance.post(`/website/online-bookings/${bookingId}/payment`, { paymentIntentId });
        paid = res?.data?.data || null;
      } catch (err) {
        const code = err?.response?.data?.errorCode;
        if (code === 'PAYMENT_NOT_SUCCEEDED') {
          // Some bank/PayPal payments settle asynchronously — the webhook finalises it.
          setState({ status: 'pending', message: t('checkout:return.processing', 'Your payment is being processed. We will email your confirmation as soon as it clears.'), booking: null });
          return;
        }
        throw err;
      }

      const purpose = paid?.purpose || (balanceRun ? 'balance' : 'full');
      const left = Number(paid?.balanceAmount) || 0;

      // A balance payment settles the money on a trip already reserved: read the booking back
      // for its reference and say what is left, if anything. No supplier call, no conversion.
      if (purpose === 'balance') {
        let booking = null;
        try {
          const { data } = await axiosInstance.get(`/website/online-bookings/${bookingId}`);
          booking = data?.data || null;
        } catch { /* non-fatal: payment already recorded */ }
        setState({
          status: 'success',
          title: t('checkout:return.titleBalancePaid', 'Payment received'),
          message: left > 0
            ? t('checkout:return.balancePartly', { amount: euros(left), defaultValue: 'Thank you. {{amount}} is still to pay on this booking.' })
            : t('checkout:return.balancePaid', 'Thank you. Your trip is now paid in full.'),
          booking,
        });
        return;
      }

      // 2) Reserve with suppliers + confirm. Payment already succeeded, so a confirm
      //    failure must not look like a payment failure.
      let reservationPending = false;
      try {
        await axiosInstance.post(`/website/online-bookings/${bookingId}/confirm`, { mode });
      } catch {
        reservationPending = true;
      }

      // 3) Read the booking back for its reference.
      let booking = null;
      try {
        const { data } = await axiosInstance.get(`/website/online-bookings/${bookingId}`);
        booking = data?.data || null;
      } catch { /* non-fatal: payment already recorded */ }

      /**
       * GA4 `purchase` for the redirect payment methods (Tracking Master §12).
       *
       * The same §15 conditions as the card path, and they bite harder here because this
       * page is a real URL a customer can refresh or reopen from history:
       *
       *   - `!reservationPending`: payment landed but the supplier did not confirm, which
       *     §15 lists as "supplier booking fails". No conversion is reported.
       *   - `bookingReference`: the unique SUNSKY reference, read back from the booking.
       *   - the `trackPurchase` guard: a refresh re-runs this whole effect, and the
       *     transaction id it would report is one already sent. It is dropped there.
       *
       * §14: the FINAL confirmed amount wins, so the booking's own `grandTotal` is
       * preferred over the figure stashed at redirect time, which predates any adjustment
       * the confirm step made.
       */
      const pending = readPurchaseContext(bookingId);
      const reference = booking?.bookingReference;
      if (!reservationPending && reference && pending) {
        trackPurchase({
          ...pending,
          transactionId: reference,
          value: Number(booking?.grandTotal) || pending.value,
        });
      }
      // Cleared either way: a booking that failed to confirm must not have its context
      // picked up by a later payment in the same tab.
      if (!reservationPending) clearPurchaseContext();

      // A deposit: what is left and by when, so the customer leaves knowing the next step.
      const due = dmy(paid?.balanceDueDate || booking?.balanceDueDate);
      const depositLine = purpose === 'deposit' && left > 0
        ? ` ${due
          ? t('checkout:return.depositBalance', { amount: euros(left), date: due, defaultValue: 'Pay the remaining {{amount}} by {{date}} from My Bookings.' })
          : t('checkout:return.depositBalanceNoDate', { amount: euros(left), defaultValue: 'Pay the remaining {{amount}} before departure from My Bookings.' })}`
        : '';
      setState({
        status: reservationPending ? 'pending' : 'success',
        message: (reservationPending
          ? (purpose === 'deposit'
            ? t('checkout:return.depositPendingFinalisation', 'Deposit received. Your booking is being finalised: you will receive your confirmation by email shortly.')
            : t('checkout:return.pendingFinalisation', 'Payment received. Your booking is being finalised — you will receive your confirmation by email shortly.'))
          : (purpose === 'deposit'
            ? t('checkout:return.depositSuccess', 'Deposit received and your booking is confirmed.')
            : t('checkout:return.success', 'Payment received and your booking is confirmed.'))) + depositLine,
        booking,
      });
    })().catch((err) => {
      setState({
        status: 'error',
        message: err?.response?.data?.message || err?.message || t('checkout:return.genericError', 'Something went wrong finalising your payment.'),
        booking: null,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const ref = state.booking?.bookingReference;
  const ok = state.status === 'success';
  const pending = state.status === 'pending';
  const error = state.status === 'error';
  const working = state.status === 'working';

  const color = ok ? '#16a34a' : pending ? '#f5a51e' : error ? '#ef4444' : '#1a2744';

  return (
    <div style={{ maxWidth: 560, margin: '64px auto', padding: '0 20px', textAlign: 'center', fontFamily: "'DM Sans', -apple-system, sans-serif", color: '#1a2744' }}>
      {working ? (
        <div style={{ width: 44, height: 44, margin: '0 auto 22px', border: '4px solid #eef1f7', borderTopColor: '#f5a51e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      ) : (
        <div style={{ width: 64, height: 64, margin: '0 auto 22px', borderRadius: '50%', background: `${color}1a`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700 }}>
          {ok ? '✓' : pending ? '⏳' : '!'}
        </div>
      )}

      <h1 style={{ fontSize: 24, margin: '0 0 10px' }}>
        {working ? t('checkout:return.finalising', 'Finalising your payment…')
          : ok && state.title ? state.title
          : ok ? t('checkout:return.titleConfirmed', 'Booking confirmed')
          : pending ? t('checkout:return.titleProcessing', 'Payment processing')
          : t('checkout:return.titleNotCompleted', 'Payment not completed')}
      </h1>
      <p style={{ color: '#5b6b86', margin: '0 0 20px', lineHeight: 1.5 }}>{state.message}</p>

      {ref && (
        <div style={{ display: 'inline-block', background: '#f6f8fc', border: '1px solid #e6ebf4', borderRadius: 10, padding: '12px 18px', marginBottom: 24 }}>
          <span style={{ color: '#5b6b86', fontSize: 13 }}>{t('checkout:return.bookingReference', 'Booking reference')}</span>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.5 }}>{ref}</div>
        </div>
      )}

      {!working && (
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/account/bookings')} style={{ padding: '11px 20px', borderRadius: 10, border: 'none', background: '#f5a51e', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            {t('checkout:return.viewMyBookings', 'View my bookings')}
          </button>
          <button onClick={() => navigate('/')} style={{ padding: '11px 20px', borderRadius: 10, border: '1px solid #d8dfec', background: '#fff', color: '#1a2744', fontWeight: 600, cursor: 'pointer' }}>
            {t('checkout:return.backToHome', 'Back to home')}
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
