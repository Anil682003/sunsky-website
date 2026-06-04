import { useEffect, useState } from 'react';
import axiosInstance from '../../services/axiosInstance';

const fmt = (n) => `€${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_COLORS = {
  Confirmed: { bg: '#d1fae5', color: '#065f46' },
  Pending:   { bg: '#fef3c7', color: '#92400e' },
  Cancelled: { bg: '#fee2e2', color: '#991b1b' },
  Draft:     { bg: '#f3f4f6', color: '#374151' },
};

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    axiosInstance.get('/public/bookings')
      .then((res) => setBookings(res.data.data || []))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load bookings'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={s.center}>Loading your bookings…</div>;
  if (error)   return <div style={{ ...s.center, color: '#dc2626' }}>{error}</div>;

  return (
    <div style={s.page}>
      <h2 style={s.heading}>My Bookings</h2>

      {bookings.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>✈️</div>
          <p style={s.emptyText}>You have no bookings yet.</p>
        </div>
      ) : (
        <div style={s.list}>
          {bookings.map((b) => {
            const statusStyle = STATUS_COLORS[b.bookingStatus] || STATUS_COLORS.Draft;
            const balance = parseFloat(b.balanceAmount || 0);
            return (
              <div key={b.id} style={s.card}>
                <div style={s.cardTop}>
                  <div>
                    <div style={s.ref}>{b.bookingReference}</div>
                    {b.productSummary && <div style={s.summary}>{b.productSummary}</div>}
                  </div>
                  <span style={{ ...s.badge, background: statusStyle.bg, color: statusStyle.color }}>
                    {b.bookingStatus}
                  </span>
                </div>

                <div style={s.meta}>
                  {b.startDate && (
                    <div style={s.metaItem}>
                      <span style={s.metaLabel}>Departure</span>
                      <span style={s.metaValue}>{new Date(b.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  )}
                  <div style={s.metaItem}>
                    <span style={s.metaLabel}>Total</span>
                    <span style={s.metaValue}>{fmt(b.grandTotal)}</span>
                  </div>
                  <div style={s.metaItem}>
                    <span style={s.metaLabel}>Paid</span>
                    <span style={{ ...s.metaValue, color: '#059669' }}>{fmt(b.paidAmount)}</span>
                  </div>
                  <div style={s.metaItem}>
                    <span style={s.metaLabel}>Balance due</span>
                    <span style={{ ...s.metaValue, color: balance > 0 ? '#dc2626' : '#059669', fontWeight: 700 }}>
                      {fmt(balance)}
                    </span>
                  </div>
                </div>

                <div style={s.cardFoot}>
                  <span style={s.date}>Booked {new Date(b.createdAt).toLocaleDateString('en-GB')}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s = {
  page:      { padding: '32px 24px', maxWidth: 860, margin: '0 auto' },
  heading:   { fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 24 },
  center:    { textAlign: 'center', padding: '60px 0', color: '#64748b', fontSize: 15 },
  empty:     { textAlign: 'center', padding: '60px 0' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: '#64748b', fontSize: 15 },
  list:      { display: 'flex', flexDirection: 'column', gap: 16 },
  card:      { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,.04)' },
  cardTop:   { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  ref:       { fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 2 },
  summary:   { fontSize: 13, color: '#64748b' },
  badge:     { padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' },
  meta:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px 20px', paddingBottom: 14, borderBottom: '1px solid #f1f5f9' },
  metaItem:  { display: 'flex', flexDirection: 'column', gap: 2 },
  metaLabel: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 14, fontWeight: 600, color: '#1e293b' },
  cardFoot:  { paddingTop: 12 },
  date:      { fontSize: 12, color: '#94a3b8' },
};
