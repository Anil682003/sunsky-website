import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMyBookings } from '../../api';
import i18n from '../../i18n';
import styles from './MyBookings.module.css';

// House format whatever the browser: €1.012,60.
const fmt = (n) => `€${Number(n || 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Dates are read by the browser, so they need the reader's locale rather than a hard-coded en-GB.
const dateLocale = () => (i18n.language === 'nl' ? 'nl-BE' : 'en-GB');
const fmtShort = (d) => new Date(d).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });

const STATUS_COLORS = {
  Confirmed: { bg: '#d1fae5', color: '#065f46', accent: '#10b981' },
  Pending:   { bg: '#fef3c7', color: '#92400e', accent: '#f59e0b' },
  Cancelled: { bg: '#fee2e2', color: '#991b1b', accent: '#ef4444' },
  Draft:     { bg: '#eef2f7', color: '#475569', accent: '#94a3b8' },
};

const statusLabel = (status) => i18n.t(`account:status.${String(status || 'draft').toLowerCase()}`, status || 'Draft');

// Payment chip derived from amounts — always available, even if the list API
// doesn't return a booking status.
function paymentChip(paid, balance, total, deposit = false) {
  if (total > 0 && balance <= 0) return { label: i18n.t('account:myBookings.payment.paid', 'Paid'), bg: '#d1fae5', color: '#065f46' };
  if (paid > 0 && deposit)       return { label: i18n.t('account:myBookings.payment.depositPaid', 'Deposit paid'), bg: '#fff1dc', color: '#9a5b00' };
  if (paid > 0)                  return { label: i18n.t('account:myBookings.payment.partPaid', 'Part-paid'), bg: '#dbeafe', color: '#1e40af' };
  return { label: i18n.t('account:myBookings.payment.unpaid', 'Unpaid'), bg: '#fee2e2', color: '#991b1b' };
}

// dd/mm/yyyy from the YYYY-MM-DD text, so no time zone can move the day.
const fmtDmy = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

// Pick an icon from the product summary.
function productIcon(summary) {
  const s = (summary || '').toLowerCase();
  if (s.includes('flight') && s.includes('hotel')) return '🧳';
  if (s.includes('flight')) return '✈️';
  if (s.includes('hotel')) return '🏨';
  return '🎫';
}

export default function MyBookings() {
  const { t } = useTranslation('account');
  const { data: bookings, loading, error } = useMyBookings();
  const bookingList = bookings ?? [];

  if (loading) return <div className={styles.page}><div className={styles.center}>{t('account:myBookings.loading', 'Loading your bookings…')}</div></div>;
  if (error)   return <div className={styles.page}><div className={styles.center} style={{ color: '#dc2626' }}>{error}</div></div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('common:nav.myBookings', 'My Bookings')}</h1>
        <p className={styles.subtitle}>
          {bookingList.length
            ? t('account:myBookings.subtitleCount', {
                count: bookingList.length,
                defaultValue_one: '{{count}} trip on your account',
                defaultValue_other: '{{count}} trips on your account',
              })
            : t('account:myBookings.subtitleEmpty', 'Your trips will appear here once you book.')}
        </p>
      </header>

      {bookingList.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>✈️</div>
          <h3 className={styles.emptyTitle}>{t('account:myBookings.emptyTitle', 'No bookings yet')}</h3>
          <p className={styles.emptyText}>{t('account:myBookings.emptyText', 'Find your next sun-soaked getaway and it’ll show up right here.')}</p>
          <Link to="/" className={styles.emptyBtn}>{t('account:myBookings.startExploring', 'Start exploring')}</Link>
        </div>
      ) : (
        <div className={styles.list}>
          {bookingList.map((b) => {
            const total   = parseFloat(b.grandTotal || 0);
            const paid    = parseFloat(b.paidAmount || 0);
            const balance = parseFloat(b.balanceAmount != null ? b.balanceAmount : total - paid);
            const st      = STATUS_COLORS[b.bookingStatus] || STATUS_COLORS.Draft;
            const deposit = b.paymentPlan === 'deposit';
            const pay     = paymentChip(paid, balance, total, deposit);
            // A deposit booking with its balance still to pay: the card says so and leads there.
            const payLater = deposit && b.paymentStatus === 'Partial' && balance > 0
              && ['Pending', 'Confirmed'].includes(b.status || b.bookingStatus);

            return (
              <Link key={b.id} to={`/account/bookings/${b.bookingReference}`} className={styles.card}>
                <span className={styles.accent} style={{ background: st.accent }} />

                <div className={styles.cardTop}>
                  <div className={styles.refWrap}>
                    <div className={styles.icon}>{productIcon(b.productSummary)}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.ref}>{b.bookingReference}</div>
                      <div className={styles.summary}>
                        {b.productSummary
                          || (b.startDate
                                ? t('account:myBookings.departing', { date: fmtShort(b.startDate), defaultValue: 'Departing {{date}}' })
                                : t('account:myBookings.bookingDetails', 'Booking details'))}
                      </div>
                    </div>
                  </div>

                  <div className={styles.chips}>
                    {b.bookingStatus && (
                      <span className={styles.badge} style={{ background: st.bg, color: st.color }}>
                        {statusLabel(b.bookingStatus)}
                      </span>
                    )}
                    <span className={styles.badge} style={{ background: pay.bg, color: pay.color }}>
                      {pay.label}
                    </span>
                  </div>
                </div>

                <div className={styles.priceStrip}>
                  <div className={styles.priceCell}>
                    <span className={styles.priceLabel}>{t('account:price.total', 'Total')}</span>
                    <span className={styles.priceValue}>{fmt(total)}</span>
                  </div>
                  <div className={styles.priceCell}>
                    <span className={styles.priceLabel}>{t('account:price.paid', 'Paid')}</span>
                    <span className={`${styles.priceValue} ${styles.paid}`}>{fmt(paid)}</span>
                  </div>
                  <div className={styles.priceCell}>
                    <span className={styles.priceLabel}>
                      {balance > 0 && b.balanceDueDate
                        ? t('account:price.balanceDueBy', { date: fmtDmy(b.balanceDueDate), defaultValue: 'Balance due by {{date}}' })
                        : t('account:price.balanceDue', 'Balance due')}
                    </span>
                    <span className={`${styles.priceValue} ${balance > 0 ? styles.dueOwed : styles.dueOk}`}>
                      {fmt(balance)}
                    </span>
                  </div>
                </div>

                <div className={styles.foot}>
                  <span className={styles.booked}>
                    {t('account:myBookings.booked', { date: fmtShort(b.createdAt), defaultValue: 'Booked {{date}}' })}
                  </span>
                  {payLater
                    ? <span className={`${styles.view} ${styles.payLater}`}>{t('account:myBookings.payBalance', 'Pay balance')} →</span>
                    : <span className={styles.view}>{t('account:myBookings.viewDetails', 'View details')} →</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
