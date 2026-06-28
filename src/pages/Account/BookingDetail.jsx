import { useParams, Link } from 'react-router-dom';
import { useBooking } from '../../api';
import styles from './BookingDetail.module.css';

const fmt = (n) => `€${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const STATUS = {
  Confirmed: { bg: '#d1fae5', color: '#065f46' },
  Pending:   { bg: '#fef3c7', color: '#92400e' },
  Cancelled: { bg: '#fee2e2', color: '#991b1b' },
  Draft:     { bg: '#eef2f7', color: '#475569' },
};

const productIcon = (t = '') => {
  const s = String(t).toLowerCase();
  if (s.includes('flight')) return '✈️';
  if (s.includes('hotel')) return '🏨';
  if (s.includes('insurance')) return '🛡️';
  return '🎫';
};

export default function BookingDetail() {
  const { ref } = useParams();
  const { data: b, loading, error } = useBooking(ref);

  if (loading) return <div className={styles.page}><div className={styles.center}>Loading booking…</div></div>;
  if (error)   return <div className={styles.page}><div className={styles.center} style={{ color: '#dc2626' }}>{error}</div></div>;
  if (!b)      return <div className={styles.page}><div className={styles.center}>Booking not found.</div></div>;

  const st = STATUS[b.status] || STATUS.Draft;
  const total = parseFloat(b.grandTotal || 0);
  const paid = parseFloat(b.paidAmount || 0);
  const balance = parseFloat(b.balanceAmount != null ? b.balanceAmount : total - paid);
  const products = b.products || [];
  const travelers = b.travelers || [];

  return (
    <div className={styles.page}>
      <Link to="/account/bookings" className={styles.back}>← Back to my bookings</Link>

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{b.bookingReference}</h1>
          <p className={styles.subtitle}>Booked {fmtDate(b.createdAt)}</p>
        </div>
        <span className={styles.badge} style={{ background: st.bg, color: st.color }}>{b.status}</span>
      </header>

      {/* Payment summary */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Payment</h2>
        <div className={styles.priceStrip}>
          <div className={styles.priceCell}><span className={styles.priceLabel}>Total</span><span className={styles.priceValue}>{fmt(total)}</span></div>
          <div className={styles.priceCell}><span className={styles.priceLabel}>Paid</span><span className={`${styles.priceValue} ${styles.paid}`}>{fmt(paid)}</span></div>
          <div className={styles.priceCell}><span className={styles.priceLabel}>Balance due</span><span className={`${styles.priceValue} ${balance > 0 ? styles.owed : styles.paid}`}>{fmt(balance)}</span></div>
        </div>
        <div className={styles.metaRow}>
          <span>Payment status: <b>{b.paymentStatus || '—'}</b></span>
          {b.bookingType && <span>Source: <b>{b.bookingType}</b></span>}
        </div>
      </section>

      {/* Products */}
      {products.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>What’s included</h2>
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
                            <span>{l.departure ? new Date(l.departure).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </div>
                        ))}
                      </div>
                    ) : p.productType === 'Hotel' ? (
                      <div className={styles.prodMeta}>
                        {d.hotelName && <span>{d.hotelName}</span>}
                        {(d.checkin || d.checkout) && <span>{fmtDate(d.checkin)} → {fmtDate(d.checkout)}{d.nights ? ` · ${d.nights} nights` : ''}</span>}
                      </div>
                    ) : (
                      <div className={styles.prodMeta}>{d.label || p.supplierName}</div>
                    )}
                    <div className={styles.prodFoot}>
                      {p.supplierName && <span>{p.supplierName}</span>}
                      {p.supplierReference && <span>Ref: {p.supplierReference}</span>}
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
          <h2 className={styles.cardTitle}>Travellers ({travelers.length})</h2>
          <div className={styles.travelers}>
            {travelers.map((t) => (
              <div key={t.id} className={styles.traveler}>
                <div className={styles.tAvatar}>{(t.firstName || '?')[0]}{(t.lastName || '')[0]}</div>
                <div>
                  <div className={styles.tName}>{t.title ? `${t.title} ` : ''}{t.firstName} {t.lastName}{t.isLeadTraveler ? ' · Lead' : ''}</div>
                  <div className={styles.tMeta}>{t.type || 'ADT'}{t.dateOfBirth ? ` · ${fmtDate(t.dateOfBirth)}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
