import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFavourites, removeFavourite } from '../../api';
import { useToast } from '../../context/ToastContext';
import styles from './Favourites.module.css';

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=60';

export default function Favourites() {
  const { data, loading, error } = useFavourites();
  const { showToast } = useToast();
  // Track optimistically-removed codes instead of copying the list into state.
  const [removed, setRemoved] = useState(() => new Set());
  const items = (data ?? []).filter((f) => !removed.has(String(f.hotelCode)));

  const handleRemove = async (e, hotelCode) => {
    e.preventDefault();
    e.stopPropagation();
    const code = String(hotelCode);
    setRemoved((prev) => new Set(prev).add(code));
    try {
      await removeFavourite(hotelCode);
      showToast('Removed from favourites', 'success');
    } catch {
      setRemoved((prev) => { const n = new Set(prev); n.delete(code); return n; });
      showToast('Couldn’t remove favourite. Please try again.', 'error');
    }
  };

  if (loading) return <div className={styles.page}><div className={styles.center}>Loading your favourites…</div></div>;
  if (error)   return <div className={styles.page}><div className={styles.center} style={{ color: '#dc2626' }}>{error}</div></div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Favourites</h1>
        <p className={styles.subtitle}>
          {items.length
            ? `${items.length} ${items.length === 1 ? 'hotel' : 'hotels'} you’ve saved`
            : 'Hotels you heart will be saved here.'}
        </p>
      </header>

      {items.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>♡</div>
          <h3 className={styles.emptyTitle}>No favourites yet</h3>
          <p className={styles.emptyText}>Tap the heart on any hotel to save it for later.</p>
          <Link to="/results" className={styles.emptyBtn}>Browse hotels</Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {items.map((f) => (
            <Link key={f.id ?? f.hotelCode} to={`/hotel/${f.hotelCode}`} className={styles.card}>
              <div className={styles.imgWrap}>
                <img
                  src={f.imageUrl || FALLBACK_IMG}
                  alt={f.hotelName || 'Hotel'}
                  loading="lazy"
                  onError={(e) => { e.currentTarget.src = FALLBACK_IMG; }}
                />
                <button
                  type="button"
                  className={styles.heart}
                  onClick={(e) => handleRemove(e, f.hotelCode)}
                  aria-label="Remove from favourites"
                  title="Remove from favourites"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                  </svg>
                </button>
              </div>
              <div className={styles.body}>
                <div className={styles.stars}>{f.stars > 0 ? '★'.repeat(Math.min(f.stars, 5)) : ''}</div>
                <h3 className={styles.name}>{f.hotelName || `Hotel ${f.hotelCode}`}</h3>
                <div className={styles.loc}>
                  {f.destination && (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                      </svg>
                      {f.destination}
                    </>
                  )}
                </div>
                <span className={styles.view}>View hotel →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
