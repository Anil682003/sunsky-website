import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axiosInstance from '../../services/axiosInstance';

/**
 * Redirect-payment return page  (route: /checkout/return)
 *
 * Redirect-based methods (Bancontact / iDEAL / PayPal) send the customer away to
 * their bank / PayPal and back here. Stripe appends `payment_intent` and
 * `redirect_status` to the URL; we added `bookingId` and `mode`. This page:
 *   1. records the payment on the backend (which re-verifies the PaymentIntent),
 *   2. reserves with suppliers + confirms the booking,
 *   3. shows the result.
 * The Stripe webhook is the safety net if the customer never lands here.
 */
export default function CheckoutReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);
  const [state, setState] = useState({ status: 'working', message: 'Finalising your payment…', booking: null });

  useEffect(() => {
    if (ran.current) return; // guard against React StrictMode double-invoke
    ran.current = true;

    const bookingId = params.get('bookingId');
    const mode = params.get('mode') || 'test';
    const paymentIntentId = params.get('payment_intent');
    const redirectStatus = params.get('redirect_status');

    (async () => {
      if (!bookingId) {
        setState({ status: 'error', message: 'Missing booking reference in the return URL.', booking: null });
        return;
      }
      if (redirectStatus === 'failed') {
        setState({ status: 'error', message: 'The payment was not completed. You have not been charged.', booking: null });
        return;
      }

      // 1) Record the payment — the backend re-verifies the PaymentIntent with Stripe.
      try {
        await axiosInstance.post(`/website/online-bookings/${bookingId}/payment`, { paymentIntentId });
      } catch (err) {
        const code = err?.response?.data?.errorCode;
        if (code === 'PAYMENT_NOT_SUCCEEDED') {
          // Some bank/PayPal payments settle asynchronously — the webhook finalises it.
          setState({ status: 'pending', message: 'Your payment is being processed. We will email your confirmation as soon as it clears.', booking: null });
          return;
        }
        throw err;
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
      } catch { /* non-fatal — payment already recorded */ }

      setState({
        status: reservationPending ? 'pending' : 'success',
        message: reservationPending
          ? 'Payment received. Your booking is being finalised — you will receive your confirmation by email shortly.'
          : 'Payment received and your booking is confirmed.',
        booking,
      });
    })().catch((err) => {
      setState({
        status: 'error',
        message: err?.response?.data?.message || err?.message || 'Something went wrong finalising your payment.',
        booking: null,
      });
    });
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
        {working ? 'Finalising your payment…' : ok ? 'Booking confirmed' : pending ? 'Payment processing' : 'Payment not completed'}
      </h1>
      <p style={{ color: '#5b6b86', margin: '0 0 20px', lineHeight: 1.5 }}>{state.message}</p>

      {ref && (
        <div style={{ display: 'inline-block', background: '#f6f8fc', border: '1px solid #e6ebf4', borderRadius: 10, padding: '12px 18px', marginBottom: 24 }}>
          <span style={{ color: '#5b6b86', fontSize: 13 }}>Booking reference</span>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.5 }}>{ref}</div>
        </div>
      )}

      {!working && (
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/account/bookings')} style={{ padding: '11px 20px', borderRadius: 10, border: 'none', background: '#f5a51e', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            View my bookings
          </button>
          <button onClick={() => navigate('/')} style={{ padding: '11px 20px', borderRadius: 10, border: '1px solid #d8dfec', background: '#fff', color: '#1a2744', fontWeight: 600, cursor: 'pointer' }}>
            Back to home
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
