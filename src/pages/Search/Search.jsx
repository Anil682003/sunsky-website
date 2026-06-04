import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import styles from './Search.module.css';
import axiosInstance from '../../services/axiosInstance';

// ── Board code → label ───────────────────────────────────────────────────────
const BOARD_LABELS = {
  AI: 'All Inclusive', TI: 'All Inclusive+', FB: 'Full Board',
  HB: 'Half Board',   BB: 'Bed & Breakfast', RO: 'Room Only',
};

// ── ISO country code → name (common travel destinations) ────────────────────
const COUNTRY_NAMES = {
  ES: 'Spain',    GR: 'Greece',       TR: 'Turkey',    EG: 'Egypt',
  TH: 'Thailand', MV: 'Maldives',     MA: 'Morocco',   PT: 'Portugal',
  IT: 'Italy',    FR: 'France',       MT: 'Malta',     HR: 'Croatia',
  CY: 'Cyprus',   TN: 'Tunisia',      AE: 'UAE',       MX: 'Mexico',
  DO: 'Dominican Republic',           CU: 'Cuba',      ID: 'Indonesia',
  IN: 'India',    LK: 'Sri Lanka',    VN: 'Vietnam',   JP: 'Japan',
  DE: 'Germany',  GB: 'United Kingdom', NL: 'Netherlands', BE: 'Belgium',
  US: 'USA',      BR: 'Brazil',       ZA: 'South Africa', KE: 'Kenya',
};

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80';
const BOARD_FILTER_OPTIONS = ['All Inclusive', 'Half Board', 'Bed & Breakfast', 'Room Only'];
const STAR_OPTIONS = [5, 4, 3, 2];
const SORT_OPTIONS = ['Most Booked', 'Rating', 'Stars'];
const DURATION_OPTIONS = ['6 days', '7 days', '8 days', '9 days', '10 days'];
const ACCOM_TYPES = ['Hotel', 'Resort', 'Apartment', 'Bungalow'];
const FACILITIES = ['WiFi', 'Pool', 'Air Conditioning', 'Restaurant', 'Spa / Wellness', 'Fitness'];
const BADGES = ['Top Pick', 'Popular Choice', 'Top Rated', 'Best Value', 'Recommended'];

const toTitle = (s) =>
  s?.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()) || '';

const getBoardLabel = (boards) => {
  if (!boards?.length) return null;
  for (const c of ['AI', 'TI', 'FB', 'HB', 'BB', 'RO']) {
    if (boards.includes(c)) return BOARD_LABELS[c];
  }
  return BOARD_LABELS[boards[0]] || boards[0];
};

const getBoardTags = (boards) =>
  (boards || []).map((c) => BOARD_LABELS[c] || c).filter(Boolean).slice(0, 4);

// ── Shared UI components ─────────────────────────────────────────────────────
const Icon = ({ d, size = 14, sw = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const StarIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

function FilterSection({ title, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`${styles.filterSection} ${open ? styles.filterOpen : ''}`}>
      <div className={styles.filterHeader} onClick={() => setOpen(!open)}>
        <h3>{title}</h3>
        <svg className={styles.filterArrow} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
      {open && <div className={styles.filterBody}>{children}</div>}
    </div>
  );
}

function FilterCheck({ label, checked, onChange }) {
  return (
    <label className={styles.filterCheck}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Search() {
  const [params] = useSearchParams();

  const destination = params.get('destination') || '';
  const date        = params.get('date')        || '';
  const duration    = params.get('duration')    || '7 days';
  const adults      = params.get('adults')      || '2';
  const children    = params.get('children')    || '0';

  const [sort, setSort]             = useState('Most Booked');
  const [loading, setLoading]       = useState(true);
  const [hotels, setHotels]         = useState([]);
  const [liked, setLiked]           = useState({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [starFilter, setStarFilter] = useState([]);
  const [boardFilter, setBoardFilter] = useState([]);

  // ── Fetch hotels from /api/hotels when destination or filters change ────────
  useEffect(() => {
    // destination comes as "City, Country" from the typeahead — use the city part
    const citySearch = destination.split(',')[0]?.trim();
    if (!citySearch) {
      setHotels([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const sortMap = {
      'Stars':      { sortBy: 'category', sortOrder: 'DESC' },
      'Rating':     { sortBy: 'ranking',  sortOrder: 'ASC'  },
      'Most Booked':{ sortBy: 'ranking',  sortOrder: 'ASC'  },
    };
    const { sortBy, sortOrder } = sortMap[sort] || { sortBy: 'ranking', sortOrder: 'ASC' };

    axiosInstance
      .get('/hotels', {
        params: { search: citySearch, status: 'active', limit: 40, sortBy, sortOrder },
      })
      .then((res) => {
        let data = (res.data.data || []).map((h, i) => ({
          id:        h.id,
          name:      toTitle(h.name),
          loc:       [toTitle(h.city), COUNTRY_NAMES[h.countryCode] || h.countryCode].filter(Boolean).join(', '),
          stars:     h.stars || 0,
          img:       h.primaryImage || FALLBACK_IMG,
          boards:    h.boards,
          board:     getBoardLabel(h.boards),
          boardTags: getBoardTags(h.boards),
          badge:     BADGES[i % BADGES.length],
        }));

        // Client-side filters
        if (starFilter.length > 0) {
          data = data.filter((h) => starFilter.includes(h.stars));
        }
        if (boardFilter.length > 0) {
          data = data.filter((h) =>
            h.boards?.some((b) => boardFilter.includes(BOARD_LABELS[b]))
          );
        }

        setHotels(data);
        setLoading(false);
      })
      .catch(() => {
        setHotels([]);
        setLoading(false);
      });
  }, [destination, sort, starFilter, boardFilter]);

  const toggleLike  = (id) => setLiked((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleStar  = (s)  => setStarFilter((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  const toggleBoard = (b)  => setBoardFilter((prev) => prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]);

  const chips = [];
  if (destination) chips.push(destination);
  if (date) chips.push(date);
  if (duration) chips.push(duration);
  chips.push(`${adults} Adult${adults !== '1' ? 's' : ''}${children !== '0' ? `, ${children} Child${children !== '1' ? 'ren' : ''}` : ''}`);

  // ── Sidebar (shared between desktop + mobile drawer) ──────────────────────
  const sidebar = (
    <>
      <FilterSection title="Transport Type" defaultOpen>
        <FilterCheck label="Include flight" checked onChange={() => {}} />
        <FilterCheck label="Own transport" checked={false} onChange={() => {}} />
      </FilterSection>
      <FilterSection title="Travel Duration" defaultOpen>
        {DURATION_OPTIONS.map((d) => (
          <FilterCheck key={d} label={d} checked={d === duration} onChange={() => {}} />
        ))}
      </FilterSection>
      <FilterSection title="Board Type" defaultOpen={false}>
        {BOARD_FILTER_OPTIONS.map((b) => (
          <FilterCheck key={b} label={b} checked={boardFilter.includes(b)} onChange={() => toggleBoard(b)} />
        ))}
      </FilterSection>
      <FilterSection title="Hotel Stars" defaultOpen={false}>
        <div className={styles.filterStars}>
          {STAR_OPTIONS.map((s) => (
            <button
              key={s}
              className={`${styles.filterStarBtn} ${starFilter.includes(s) ? styles.filterStarActive : ''}`}
              onClick={() => toggleStar(s)}
            >
              <StarIcon size={12} /> {s}
            </button>
          ))}
        </div>
      </FilterSection>
      <FilterSection title="Accommodation Type" defaultOpen={false}>
        {ACCOM_TYPES.map((a) => (
          <FilterCheck key={a} label={a} checked={a === 'Hotel'} onChange={() => {}} />
        ))}
      </FilterSection>
      <FilterSection title="Facilities" defaultOpen={false}>
        {FACILITIES.map((f) => (
          <FilterCheck key={f} label={f} checked={false} onChange={() => {}} />
        ))}
      </FilterSection>
    </>
  );

  return (
    <div className={styles.page}>
      {/* ── Summary bar ─────────────────────────────────────────────────────── */}
      <div className={styles.summaryBar}>
        <div className={styles.summaryInner}>
          <div className={styles.summaryLeft}>
            <div className={styles.summaryCount}>
              <span>{loading ? '…' : hotels.length}</span> Hotels Found
            </div>
            <div className={styles.chips}>
              {chips.map((c) => <div key={c} className={styles.chip}>{c}</div>)}
            </div>
          </div>
          <div className={styles.summaryRight}>
            <select className={styles.sortSelect} value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORT_OPTIONS.map((o) => <option key={o}>{o}</option>)}
            </select>
            <button className={styles.mobileFilterBtn} onClick={() => setDrawerOpen(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
              </svg>
              Filters
            </button>
          </div>
        </div>
      </div>

      {/* ── Main layout ─────────────────────────────────────────────────────── */}
      <div className={styles.main}>
        <aside className={styles.sidebar}>
          <div className={styles.filterCard}>{sidebar}</div>
        </aside>

        <section className={styles.results}>
          <div className={styles.resultsList}>
            {loading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className={styles.skeletonCard}>
                  <div className={styles.skeletonImg} />
                  <div className={styles.skeletonBody}>
                    <div className={`${styles.skeletonLine} ${styles.skW60}`} />
                    <div className={`${styles.skeletonLine} ${styles.skW40}`} />
                    <div className={`${styles.skeletonLine} ${styles.skW80}`} />
                    <div className={`${styles.skeletonLine} ${styles.skW80}`} />
                    <div className={`${styles.skeletonLine} ${styles.skW30}`} />
                  </div>
                </div>
              ))
            ) : hotels.length === 0 ? (
              <div className={styles.noResults}>
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                <h3>No hotels found</h3>
                <p>Try a different destination or adjust your filters.</p>
              </div>
            ) : (
              hotels.map((h, i) => (
                <div key={h.id} className={styles.resultCard} style={{ animationDelay: `${i * 0.06}s` }}>
                  {/* ── Image column ─────────────────────────────────────── */}
                  <div className={styles.rcImg}>
                    <img src={h.img} alt={h.name} loading="lazy" />
                    <div className={styles.rcImgOverlay} />
                    <div className={styles.rcBadge}>
                      <Icon d="M13 10V3L4 14h7v7l9-11h-7z" size={12} sw={2} />
                      {h.badge}
                    </div>
                    <div
                      className={`${styles.rcHeart} ${liked[h.id] ? styles.rcHeartLiked : ''}`}
                      onClick={() => toggleLike(h.id)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill={liked[h.id] ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                      </svg>
                    </div>
                    <div className={styles.rcImgInfo}>
                      <div className={styles.rcStars}>
                        {Array.from({ length: h.stars }).map((_, j) => <StarIcon key={j} size={12} />)}
                      </div>
                    </div>
                  </div>

                  {/* ── Content column ───────────────────────────────────── */}
                  <div className={styles.rcContent}>
                    <div className={styles.rcTop}>
                      <div className={styles.rcTopLeft}>
                        <h3 className={styles.rcName}>{h.name}</h3>
                        <div className={styles.rcLocation}>
                          <Icon d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 13a3 3 0 100-6 3 3 0 000 6z" size={13} sw={1.6} />
                          {h.loc}
                        </div>
                      </div>
                    </div>

                    {/* Board types as amenity tags */}
                    {h.boardTags.length > 0 && (
                      <div className={styles.rcAmenities}>
                        {h.boardTags.map((b) => (
                          <span key={b} className={styles.rcAmenity}>
                            <CheckIcon />
                            {b}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className={styles.rcTrip}>
                      {date && (
                        <span className={styles.rcTripItem}>
                          <Icon d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" size={13} sw={1.6} />
                          {date}
                        </span>
                      )}
                      <span className={styles.rcTripItem}>
                        <Icon d="M5 13l4 4L19 7" size={13} sw={2} />
                        Transfer available
                      </span>
                      {h.board && (
                        <span className={styles.rcTripItem}>
                          <Icon d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3" size={13} sw={1.6} />
                          {h.board}
                        </span>
                      )}
                    </div>

                    <div className={styles.rcPriceBox}>
                      <div className={styles.rcPriceInfo}>
                        <div className={styles.rcPriceLabel}>Contact us for pricing</div>
                      </div>
                      <button className={styles.rcCta}>
                        View Deal
                        <Icon d="M5 12h14M12 5l7 7-7 7" size={14} sw={2.2} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* ── Mobile filter drawer ─────────────────────────────────────────────── */}
      {drawerOpen && (
        <>
          <div className={styles.drawerOverlay} onClick={() => setDrawerOpen(false)} />
          <div className={styles.drawer}>
            <div className={styles.drawerHead}>
              <h2>Filters</h2>
              <button className={styles.drawerClose} onClick={() => setDrawerOpen(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className={styles.drawerBody}>{sidebar}</div>
          </div>
        </>
      )}
    </div>
  );
}
