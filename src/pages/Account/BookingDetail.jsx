import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useBooking } from '../../api';
import i18n from '../../i18n';
import styles from './BookingDetail.module.css';

const fmt = (n) => `€${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Dates are read by the browser, so they need the reader's locale rather than a hard-coded en-GB.
const dateLocale = () => (i18n.language === 'nl' ? 'nl-BE' : 'en-GB');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(dateLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

const STATUS = {
  Confirmed: { bg: '#d1fae5', color: '#065f46' },
  Pending:   { bg: '#fef3c7', color: '#92400e' },
  Cancelled: { bg: '#fee2e2', color: '#991b1b' },
  Draft:     { bg: '#eef2f7', color: '#475569' },
};

const statusLabel = (status) => i18n.t(`account:status.${String(status || 'draft').toLowerCase()}`, status || 'Draft');

const productIcon = (t = '') => {
  const s = String(t).toLowerCase();
  if (s.includes('flight')) return '✈️';
  if (s.includes('hotel')) return '🏨';
  if (s.includes('insurance')) return '🛡️';
  return '🎫';
};

export default function BookingDetail() {
  const { t } = useTranslation('account');
  const { ref } = useParams();
  const { data: b, loading, error } = useBooking(ref);

  if (loading) return <div className={styles.page}><div className={styles.center}>{t('account:bookingDetail.loading', 'Loading booking…')}</div></div>;
  if (error)   return <div className={styles.page}><div className={styles.center} style={{ color: '#dc2626' }}>{error}</div></div>;
  if (!b)      return <div className={styles.page}><div className={styles.center}>{t('account:bookingDetail.notFound', 'Booking not found.')}</div></div>;

  const st = STATUS[b.status] || STATUS.Draft;
  const total = parseFloat(b.grandTotal || 0);
  const paid = parseFloat(b.paidAmount || 0);
  const balance = parseFloat(b.balanceAmount != null ? b.balanceAmount : total - paid);
  const products = b.products || [];
  const travelers = b.travelers || [];

  return (
    <div className={styles.page}>
      <Link to="/account/bookings" className={styles.back}>← {t('account:bookingDetail.backToBookings', 'Back to my bookings')}</Link>

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{b.bookingReference}</h1>
          <p className={styles.subtitle}>{t('account:myBookings.booked', { date: fmtDate(b.createdAt), defaultValue: 'Booked {{date}}' })}</p>
        </div>
        <span className={styles.badge} style={{ background: st.bg, color: st.color }}>{statusLabel(b.status)}</span>
      </header>

      {/* Payment summary */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t('account:bookingDetail.payment', 'Payment')}</h2>
        <div className={styles.priceStrip}>
          <div className={styles.priceCell}><span className={styles.priceLabel}>{t('account:price.total', 'Total')}</span><span className={styles.priceValue}>{fmt(total)}</span></div>
          <div className={styles.priceCell}><span className={styles.priceLabel}>{t('account:price.paid', 'Paid')}</span><span className={`${styles.priceValue} ${styles.paid}`}>{fmt(paid)}</span></div>
          <div className={styles.priceCell}><span className={styles.priceLabel}>{t('account:price.balanceDue', 'Balance due')}</span><span className={`${styles.priceValue} ${balance > 0 ? styles.owed : styles.paid}`}>{fmt(balance)}</span></div>
        </div>
        <div className={styles.metaRow}>
          <span>{t('account:bookingDetail.paymentStatus', 'Payment status:')} <b>{b.paymentStatus || '—'}</b></span>
          {b.bookingType && <span>{t('account:bookingDetail.source', 'Source:')} <b>{b.bookingType}</b></span>}
        </div>
      </section>

      {/* Products */}
      {products.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t('account:bookingDetail.whatsIncluded', 'What’s included')}</h2>
          <div className={styles.products}>
            {products.map((p) => {
              const d = p.productDetails || {};
              const legs = d.legs || [];
              return (
                <div key={p.id} className={styles.product}>
                  <div className={styles.prodIcon}>{productIcon(p.productType)}</div>
                  <div className={styles.prodBody}>
                    <div className={styles.prodTop}>
                      <span className={styles.prodType}>{p.productType}</span>
                      <span className={styles.prodStatus}>{p.productStatus}</span>
                    </div>
                    {p.productType === 'Flight' && legs.length > 0 ? (
                      <div className={styles.legs}>
                        {legs.map((l, i) => (
                          <div key={i} className={styles.leg}>
                            <b>{l.from} → {l.to}</b>
                            <span>{l.airline} {l.flightNumber}</span>
                            <span>{fmtDateTime(l.departure)}</span>
                          </div>
                        ))}
                      </div>
                    ) : p.productType === 'Hotel' ? (
                      <div className={styles.prodMeta}>
                        {d.hotelName && <span>{d.hotelName}</span>}
                        {(d.checkin || d.checkout) && (
                          <span>
                            {fmtDate(d.checkin)} → {fmtDate(d.checkout)}
                            {d.nights ? ` · ${t('account:bookingDetail.nights', { count: d.nights, defaultValue_one: '{{count}} night', defaultValue_other: '{{count}} nights' })}` : ''}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className={styles.prodMeta}>{d.label || p.supplierName}</div>
                    )}
                    <div className={styles.prodFoot}>
                      {p.supplierName && <span>{p.supplierName}</span>}
                      {p.supplierReference && <span>{t('account:bookingDetail.ref', { ref: p.supplierReference, defaultValue: 'Ref: {{ref}}' })}</span>}
                      <span className={styles.prodPrice}>{fmt(p.sellingPrice)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Travellers */}
      {travelers.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t('account:bookingDetail.travellers', { count: travelers.length, defaultValue: 'Travellers ({{count}})' })}</h2>
          <div className={styles.travelers}>
            {travelers.map((tr) => (
              <div key={tr.id} className={styles.traveler}>
                <div className={styles.tAvatar}>{(tr.firstName || '?')[0]}{(tr.lastName || '')[0]}</div>
                <div>
                  <div className={styles.tName}>{tr.title ? `${tr.title} ` : ''}{tr.firstName} {tr.lastName}{tr.isLeadTraveler ? ` · ${t('account:bookingDetail.lead', 'Lead')}` : ''}</div>
                  <div className={styles.tMeta}>{tr.type || 'ADT'}{tr.dateOfBirth ? ` · ${fmtDate(tr.dateOfBirth)}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
