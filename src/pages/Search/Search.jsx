import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import styles from './Search.module.css';

const MOCK_HOTELS = [
  { id:1, name:'Sindbad Club', loc:'Egypt, Red Sea, Hurghada', stars:5, score:9.7, scoreLabel:'Fantastic', reviews:4601, price:697, img:'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80', amenities:['Swimming pool','Near beach','Kids club','Air conditioning','Playground'], board:'All inclusive', badge:'Most Popular', transfer:'Transfer included' },
  { id:2, name:'Steigenberger Aldau Beach', loc:'Egypt, Red Sea, Hurghada', stars:5, score:9.2, scoreLabel:'Excellent', reviews:3842, price:849, img:'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=600&q=80', amenities:['Private beach','Spa & wellness','3 Restaurants','Pool','WiFi'], board:'All inclusive', badge:'Top Rated', transfer:'Transfer included' },
  { id:3, name:'Jaz Aquamarine Resort', loc:'Egypt, Red Sea, Hurghada', stars:5, score:8.9, scoreLabel:'Very Good', reviews:2190, price:612, img:'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=600&q=80', amenities:['Aqua park','Kids club','5 Pools','Animation team','Beach'], board:'All inclusive', badge:'Best Value', transfer:'Transfer included' },
  { id:4, name:'Sunrise Royal Makadi', loc:'Egypt, Red Sea, Makadi Bay', stars:5, score:9.4, scoreLabel:'Fantastic', reviews:5120, price:923, img:'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&q=80', amenities:['Adults Only','Spa','Private beach','Diving','Fine dining'], board:'All inclusive', badge:'Adults Only', transfer:'Transfer included' },
  { id:5, name:'Desert Rose Resort', loc:'Egypt, Red Sea, Hurghada', stars:4, score:8.6, scoreLabel:'Very Good', reviews:1876, price:548, img:'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600&q=80', amenities:['Water slides','Kids pool','Animation','WiFi','Restaurant'], board:'Half board', badge:'Family Pick', transfer:'Transfer included' },
];

const BOARD_TYPES = ['All Inclusive','Half Board','Breakfast'];
const STAR_OPTIONS = [5,4,3,2];
const SORT_OPTIONS = ['Most Booked','Price: Low to High','Price: High to Low','Rating','Stars'];
const DURATION_OPTIONS = ['6 days','7 days','8 days','9 days','10 days'];
const ACCOM_TYPES = ['Hotel','Resort','Apartment','Bungalow'];
const FACILITIES = ['WiFi','Pool','Air Conditioning','Restaurant','Spa / Wellness','Fitness'];

function FilterSection({ title, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`${styles.filterSection} ${open ? styles.filterOpen : ''}`}>
      <div className={styles.filterHeader} onClick={() => setOpen(!open)}>
        <h3>{title}</h3>
        <svg className={styles.filterArrow} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
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

export default function Search() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const destination = params.get('destination') || '';
  const date = params.get('date') || '';
  const duration = params.get('duration') || '7 days';
  const adults = params.get('adults') || '2';
  const children = params.get('children') || '0';

  const [sort, setSort] = useState('Most Booked');
  const [loading, setLoading] = useState(true);
  const [hotels, setHotels] = useState([]);
  const [liked, setLiked] = useState({});
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      let sorted = [...MOCK_HOTELS];
      if (sort === 'Price: Low to High') sorted.sort((a,b) => a.price - b.price);
      if (sort === 'Price: High to Low') sorted.sort((a,b) => b.price - a.price);
      if (sort === 'Rating') sorted.sort((a,b) => b.score - a.score);
      if (sort === 'Stars') sorted.sort((a,b) => b.stars - a.stars);
      setHotels(sorted);
      setLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [sort]);

  const toggleLike = (id) => setLiked((prev) => ({ ...prev, [id]: !prev[id] }));

  const chips = [];
  if (destination) chips.push(destination);
  if (date) chips.push(date);
  if (duration) chips.push(duration);
  chips.push(`${adults} Adult${adults !== '1' ? 's' : ''}${children !== '0' ? `, ${children} Child${children !== '1' ? 'ren' : ''}` : ''}`);

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
        {BOARD_TYPES.map((b) => (
          <FilterCheck key={b} label={b} checked={b === 'All Inclusive'} onChange={() => {}} />
        ))}
      </FilterSection>

      <FilterSection title="Price Range" defaultOpen>
        <input type="range" className={styles.filterRange} min="200" max="3000" defaultValue="1500" />
        <div className={styles.filterRangeLabels}>
          <span>€200</span><span>€1,500</span><span>€3,000</span>
        </div>
      </FilterSection>

      <FilterSection title="Hotel Stars" defaultOpen={false}>
        <div className={styles.filterStars}>
          {STAR_OPTIONS.map((s) => (
            <button key={s} className={`${styles.filterStarBtn} ${s >= 4 ? styles.filterStarActive : ''}`}>
              ⭐ {s}
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
          <FilterCheck key={f} label={f} checked={f === 'WiFi' || f === 'Pool'} onChange={() => {}} />
        ))}
      </FilterSection>
    </>
  );

  return (
    <div className={styles.page}>
      {/* Summary bar */}
      <div className={styles.summaryBar}>
        <div className={styles.summaryInner}>
          <div className={styles.summaryLeft}>
            <div className={styles.summaryCount}>
              <span>{hotels.length}</span> Holidays Found
            </div>
            <div className={styles.chips}>
              {chips.map((c) => (
                <div key={c} className={styles.chip}>{c}</div>
              ))}
            </div>
          </div>
          <div className={styles.summaryRight}>
            <select className={styles.sortSelect} value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORT_OPTIONS.map((o) => <option key={o}>{o}</option>)}
            </select>
            <button className={styles.mobileFilterBtn} onClick={() => setDrawerOpen(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>
              Filters
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className={styles.main}>
        <aside className={styles.sidebar}>
          <div className={styles.filterCard}>{sidebar}</div>
        </aside>

        <section className={styles.results}>
          <div className={styles.resultsList}>
            {loading ? (
              <>
                {[1,2].map((i) => (
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
                ))}
              </>
            ) : (
              hotels.map((h, i) => (
                <div key={h.id} className={styles.resultCard} style={{ animationDelay: `${i * 0.08}s` }}>
                  <div className={styles.rcImg}>
                    <img src={h.img} alt={h.name} loading="lazy" />
                    <div className={styles.rcBadge}>🔥 {h.badge}</div>
                    <div
                      className={`${styles.rcHeart} ${liked[h.id] ? styles.rcHeartLiked : ''}`}
                      onClick={() => toggleLike(h.id)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill={liked[h.id] ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                      </svg>
                    </div>
                  </div>
                  <div className={styles.rcContent}>
                    <div className={styles.rcTop}>
                      <div>
                        <div className={styles.rcName}>{h.name}</div>
                        <div className={styles.rcLocation}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          {h.loc}
                        </div>
                        <div className={styles.rcStars}>
                          {Array.from({ length: h.stars }).map((_, j) => (
                            <span key={j} className={styles.rcStar}>★</span>
                          ))}
                        </div>
                      </div>
                      <div className={styles.rcReview}>
                        <div className={styles.rcScoreText}>
                          <div className={styles.rcScoreLabel}>{h.scoreLabel}</div>
                          <div className={styles.rcScoreCount}>{h.reviews.toLocaleString()} reviews</div>
                        </div>
                        <div className={styles.rcScore}>{h.score}</div>
                      </div>
                    </div>
                    <div className={styles.rcAmenities}>
                      {h.amenities.map((a) => (
                        <span key={a} className={styles.rcAmenity}>✔ {a}</span>
                      ))}
                    </div>
                    <div className={styles.rcTrip}>
                      <span className={styles.rcTripItem}>📅 {date || 'Flexible'}</span>
                      <span className={styles.rcTripItem}>✈️ From {destination || 'Any'}</span>
                      <span className={styles.rcTripItem}>🚌 {h.transfer}</span>
                      <span className={styles.rcTripItem}>🍽️ {h.board}</span>
                    </div>
                    <div className={styles.rcPriceBox}>
                      <div>
                        <div className={styles.rcPriceLabel}>per person from</div>
                        <div className={styles.rcPrice}>€{h.price} <span>p.p.</span></div>
                      </div>
                      <button className={styles.rcCta}>View Deal →</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Mobile filter drawer */}
      {drawerOpen && (
        <>
          <div className={styles.drawerOverlay} onClick={() => setDrawerOpen(false)} />
          <div className={styles.drawer}>
            <div className={styles.drawerHead}>
              <h2>Filters</h2>
              <button className={styles.drawerClose} onClick={() => setDrawerOpen(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className={styles.drawerBody}>{sidebar}</div>
          </div>
        </>
      )}
    </div>
  );
}
