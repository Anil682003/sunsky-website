import { Link } from 'react-router-dom';
import { useMyBookings } from '../../api';
import styles from './MyBookings.module.css';

const fmt = (n) => `€${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_COLORS = {
  Confirmed: { bg: '#d1fae5', color: '#065f46', accent: '#10b981' },
  Pending:   { bg: '#fef3c7', color: '#92400e', accent: '#f59e0b' },
  Cancelled: { bg: '#fee2e2', color: '#991b1b', accent: '#ef4444' },
  Draft:     { bg: '#eef2f7', color: '#475569', accent: '#94a3b8' },
};

// Payment chip derived from amounts — always available, even if the list API
// doesn't return a booking status.
function paymentChip(paid, balance, total) {
  if (total > 0 && balance <= 0) return { label: 'Paid', bg: '#d1fae5', color: '#065f46' };
  if (paid > 0)                  return { label: 'Part-paid', bg: '#dbeafe', color: '#1e40af' };
  return { label: 'Unpaid', bg: '#fee2e2', color: '#991b1b' };
}

// Pick an icon from the product summary.
function productIcon(summary = '') {
  const s = summary.toLowerCase();
  if (s.includes('flight') && s.includes('hotel')) return '🧳';
  if (s.includes('flight')) return '✈️';
  if (s.includes('hotel')) return '🏨';
  return '🎫';
}

export default function MyBookings() {
  const { data: bookings, loading, error } = useMyBookings();
  const bookingList = bookings ?? [];

  if (loading) return <div className={styles.page}><div className={styles.center}>Loading your bookings…</div></div>;
  if (error)   return <div className={styles.page}><div className={styles.center} style={{ color: '#dc2626' }}>{error}</div></div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>My Bookings</h1>
        <p className={styles.subtitle}>
          {bookingList.length
            ? `${bookingList.length} ${bookingList.length === 1 ? 'trip' : 'trips'} on your account`
            : 'Your trips will appear here once you book.'}
        </p>
      </header>

      {bookingList.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>✈️</div>
          <h3 className={styles.emptyTitle}>No bookings yet</h3>
          <p className={styles.emptyText}>Find your next sun-soaked getaway and it’ll show up right here.</p>
          <Link to="/" className={styles.emptyBtn}>Start exploring</Link>
        </div>
      ) : (
        <div className={styles.list}>
          {bookingList.map((b) => {
            const total   = parseFloat(b.grandTotal || 0);
            const paid    = parseFloat(b.paidAmount || 0);
            const balance = parseFloat(b.balanceAmount != null ? b.balanceAmount : total - paid);
            const st      = STATUS_COLORS[b.bookingStatus] || STATUS_COLORS.Draft;
            const pay     = paymentChip(paid, balance, total);

            return (
              <div key={b.id} className={styles.card}>
                <span className={styles.accent} style={{ background: st.accent }} />

                <div className={styles.cardTop}>
                  <div className={styles.refWrap}>
                    <div className={styles.icon}>{productIcon(b.productSummary)}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.ref}>{b.bookingReference}</div>
                      <div className={styles.summary}>
                        {b.productSummary
                          || (b.startDate
                                ? `Departing ${new Date(b.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                                : 'Booking details')}
                      </div>
                    </div>
                  </div>

                  <div className={styles.chips}>
                    {b.bookingStatus && (
                      <span className={styles.badge} style={{ background: st.bg, color: st.color }}>
                        {b.bookingStatus}
                      </span>
                    )}
                    <span className={styles.badge} style={{ background: pay.bg, color: pay.color }}>
                      {pay.label}
                    </span>
                  </div>
                </div>

                <div className={styles.priceStrip}>
                  <div className={styles.priceCell}>
                    <span className={styles.priceLabel}>Total</span>
                    <span className={styles.priceValue}>{fmt(total)}</span>
                  </div>
                  <div className={styles.priceCell}>
                    <span className={styles.priceLabel}>Paid</span>
                    <span className={`${styles.priceValue} ${styles.paid}`}>{fmt(paid)}</span>
                  </div>
                  <div className={styles.priceCell}>
                    <span className={styles.priceLabel}>Balance due</span>
                    <span className={`${styles.priceValue} ${balance > 0 ? styles.dueOwed : styles.dueOk}`}>
                      {fmt(balance)}
                    </span>
                  </div>
                </div>

                <div className={styles.foot}>
                  <span className={styles.booked}>
                    Booked {new Date(b.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
