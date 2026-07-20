import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFavourites, removeFavourite } from '../../api';
import { recallDestCode } from '../../utils/favDest';
import { useToast } from '../../context/ToastContext';
import styles from './Favourites.module.css';

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=60';

// Opening a saved hotel starts a fresh default search: check-in 2 days out, 7 nights,
// 2 adults — the params HotelDetail needs for its live price calendar.
const iso = (d) => d.toISOString().split('T')[0];
const defaultSearch = () => {
  const checkIn = new Date();
  checkIn.setDate(checkIn.getDate() + 2);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 7);
  return { checkIn: iso(checkIn), checkOut: iso(checkOut), nights: 7, adults: '2', children: '0', rooms: '1' };
};

const Icon = ({ d, size = 14, sw = 1.8, fill = 'none' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {d.map((p, i) => <path key={i} d={p} />)}
  </svg>
);

function SkeletonGrid() {
  return (
    <div className={styles.grid}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={styles.skCard} style={{ animationDelay: `${i * 0.08}s` }}>
          <div className={styles.skImg}>
            <svg className={styles.skImgIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="7.5" cy="7" r="2.5" /><path d="M3 20l5.5-7 4 5 3-3.5L21 20z" />
            </svg>
          </div>
          <div className={styles.skBody}>
            <div className={styles.skStars}>
              {[0, 1, 2, 3, 4].map((s) => <span key={s} className={styles.skStar} />)}
            </div>
            <div className={`${styles.skLine} ${styles.skName}`} />
            <div className={`${styles.skLine} ${styles.skLoc}`} />
            <div className={`${styles.skLine} ${styles.skCta}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Header({ count, loading }) {
  return (
    <header className={styles.hero}>
      <span className={styles.heroSun} aria-hidden="true" />
      <span className={`${styles.cloud} ${styles.cloud1}`} aria-hidden="true" />
      <span className={`${styles.cloud} ${styles.cloud2}`} aria-hidden="true" />
      <div className={styles.heroInner}>
        <span className={styles.eyebrow}>
          <Icon d={['M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z']} size={13} sw={2} fill="currentColor" />
          Your collection
        </span>
        <h1 className={styles.title}>Saved stays</h1>
        <p className={styles.subtitle}>
          {loading
            ? 'Gathering the places you loved…'
            : count
              ? `${count} ${count === 1 ? 'hotel' : 'hotels'} ready when you are — open one to see live prices.`
              : 'Heart any hotel and it lands here, ready to book when the moment’s right.'}
        </p>
      </div>
    </header>
  );
}

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

  return (
    <div className={styles.page}>
      <Header count={items.length} loading={loading} />

      {loading ? (
        <SkeletonGrid />
      ) : error ? (
        <div className={styles.state}>
          <div className={`${styles.stateIcon} ${styles.stateIconErr}`}>
            <Icon d={['M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z', 'M12 9v4', 'M12 17h.01']} size={30} sw={1.6} />
          </div>
          <h3 className={styles.stateTitle}>We couldn’t load your favourites</h3>
          <p className={styles.stateText}>{String(error)}</p>
        </div>
      ) : items.length === 0 ? (
        <div className={styles.state}>
          <div className={styles.stateIcon}>
            <Icon d={['M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z']} size={30} sw={1.6} />
          </div>
          <h3 className={styles.stateTitle}>No saved stays yet</h3>
          <p className={styles.stateText}>Tap the heart on any hotel and it’ll be waiting for you here.</p>
          <Link to="/results" className={styles.stateBtn}>
            Browse hotels
            <Icon d={['M5 12h14', 'M12 5l7 7-7 7']} size={15} sw={2.2} />
          </Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {items.map((f, i) => (
            <Link
              key={f.id ?? f.hotelCode}
              to={`/hotel/${f.hotelCode}`}
              state={{
                hotel: { hotelCode: f.hotelCode, name: f.hotelName, stars: f.stars, img: f.imageUrl, loc: f.destination },
                destination: f.destinationCode || recallDestCode(f.hotelCode),
                ...defaultSearch(),
              }}
              className={styles.card}
              style={{ animationDelay: `${Math.min(i, 8) * 0.06}s` }}
            >
              {/* Collection index — 01, 02, … */}
              <span className={styles.num} aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
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
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                  </svg>
                </button>
              </div>
              <div className={styles.body}>
                {f.stars > 0 && (
                  <div className={styles.stars}>
                    {'★'.repeat(Math.min(f.stars, 5))}
                    <span className={styles.starLabel}>{Math.min(f.stars, 5)}-star</span>
                  </div>
                )}
                <h3 className={styles.name}>{f.hotelName || `Hotel ${f.hotelCode}`}</h3>
                {f.destination && (
                  <div className={styles.loc}>
                    <Icon d={['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z', 'M12 13a3 3 0 100-6 3 3 0 000 6z']} size={13} sw={1.6} />
                    {f.destination}
                  </div>
                )}
                <span className={styles.cta}>
                  View live prices
                  <Icon d={['M5 12h14', 'M12 5l7 7-7 7']} size={14} sw={2.2} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
