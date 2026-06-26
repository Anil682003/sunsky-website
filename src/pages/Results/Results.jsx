import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import styles from './Results.module.css';

const CONTRACTS_API = import.meta.env.VITE_CACHE_API_URL || 'https://cache.holidaybooking.be';
const PAGE_SIZE = 20;

const bestImg = (images, fallback) => {
  if (!Array.isArray(images) || images.length === 0) return fallback;
  const sorted = [...images].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  return sorted[0]?.url || fallback;
};

const BOARD_LABELS = {
  AI: 'All Inclusive', TI: 'All Inclusive+', FB: 'Full Board',
  HB: 'Half Board',   BB: 'Bed & Breakfast', RO: 'Room Only',
  SC: 'Self Catering',
};

const BOARD_FILTER_OPTIONS = ['All Inclusive', 'Half Board', 'Bed & Breakfast', 'Room Only', 'Self Catering'];
const SORT_OPTIONS = ['Price: Low to High', 'Price: High to Low'];
const BADGES = ['Top Pick', 'Popular Choice', 'Top Rated', 'Best Value', 'Recommended'];
const FALLBACK_IMG = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const getBoardLabel = (code) => BOARD_LABELS[code] || code;
const getBoardTags  = (code) => (BOARD_LABELS[code] ? [BOARD_LABELS[code]] : [code]).filter(Boolean);
const fmtDate = (iso) => {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]}`;
};

const Icon = ({ d, size = 14, sw = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
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
      <span>{label}</span>
    </label>
  );
}

export default function Results() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const destCode         = params.get('destination')      || '';
  const destinationLabel = params.get('destinationLabel') || destCode;

  const defaultCheckIn  = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
  const defaultCheckOut = (() => { const d = new Date(); d.setDate(d.getDate() + 37); return d.toISOString().split('T')[0]; })();

  const initCheckIn  = params.get('checkIn')  || defaultCheckIn;
  const initCheckOut = params.get('checkOut') || defaultCheckOut;
  const initAdults   = params.get('adults')   || '2';
  const initChildren = params.get('children') || '0';
  const initRooms    = params.get('rooms')    || '1';
  const childAges    = params.get('childAges') || '';

  // Sidebar draft state (not yet fetched)
  const [localCheckIn,  setLocalCheckIn]  = useState(initCheckIn);
  const [localCheckOut, setLocalCheckOut] = useState(initCheckOut);
  const [localAdults,   setLocalAdults]   = useState(parseInt(initAdults));
  const [localChildren, setLocalChildren] = useState(parseInt(initChildren));
  const [localRooms,    setLocalRooms]    = useState(parseInt(initRooms));

  // Committed params that drive the API fetch
  const [fetchParams, setFetchParams] = useState({
    checkIn: initCheckIn, checkOut: initCheckOut,
    adults: initAdults, children: initChildren, rooms: initRooms,
  });

  const [sort, setSort]               = useState('Price: Low to High');
  const [loading, setLoading]         = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(true);
  const [hotels, setHotels]           = useState([]);
  const [allHotels, setAllHotels]     = useState([]);
  const [nights, setNights]           = useState(0);
  const [liked, setLiked]             = useState({});
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [boardFilter, setBoardFilter] = useState([]);
  const [classFilter, setClassFilter] = useState([]);

  // Price range filter
  const [maxPriceAvail,  setMaxPriceAvail]  = useState(5000);
  const [priceMaxFilter, setPriceMaxFilter] = useState(999999);

  // Lazy hotel-info loading
  const [infoMap, setInfoMap]         = useState({});
  const infoLoadingRef = useRef(new Set());
  const sentinelRef    = useRef(null);

  // Pagination state tracked in refs to avoid stale closures in async callbacks
  const paginationRef  = useRef({ page: 1, hasMore: true, fetching: false });
  const seenCodesRef   = useRef(new Set());

  // Fetch params ref so loadMore always sees latest values
  const fetchParamsRef    = useRef(fetchParams);
  const destCodeRef       = useRef(destCode);
  const childAgesRef      = useRef(childAges);
  const destLabelRef      = useRef(destinationLabel);
  useEffect(() => { fetchParamsRef.current = fetchParams; },    [fetchParams]);
  useEffect(() => { destCodeRef.current    = destCode; },       [destCode]);
  useEffect(() => { childAgesRef.current   = childAges; },      [childAges]);
  useEffect(() => { destLabelRef.current   = destinationLabel; }, [destinationLabel]);

  const buildQS = (fp, dc, ca, page) => {
    const roomsN = Math.max(1, parseInt(fp.rooms, 10) || 1);
    const qs = new URLSearchParams({
      destination:        dc,
      checkIn:            fp.checkIn,
      checkOut:           fp.checkOut,
      adults:             fp.adults,
      children:           fp.children,
      rooms:              String(roomsN),
      limit:              String(PAGE_SIZE),
      page:               String(page),
      source:             'combined',
      maxAdultsPerRoom:   String(Math.ceil((parseInt(fp.adults, 10) || 1) / roomsN)),
      maxChildrenPerRoom: String(Math.ceil((parseInt(fp.children, 10) || 0) / roomsN)),
    });
    if (ca) qs.set('childAges', ca);
    return qs.toString();
  };

  const mapContract = (c, label, badgeIdx) => ({
    id:           c.hotelCode,
    hotelCode:    c.hotelCode,
    name:         c.hotelName ?? `Hotel ${c.hotelCode}`,
    stars:        null,
    board:        getBoardLabel(c.board),
    boardCode:    c.board,
    boardTags:    getBoardTags(c.board),
    roomType:     c.roomType,
    characteristic: c.characteristic,
    classification: c.classification,
    contractName: c.contractName,
    totalAmount:  c.totalAmount,
    currency:     c.currency,
    nightlyBreakdown: c.nightlyBreakdown || [],
    badge:        BADGES[badgeIdx % BADGES.length],
    img:          FALLBACK_IMG,
    loc:          label,
  });

  // Initial fetch — resets everything when search params change
  useEffect(() => {
    if (!destCode) {
      setAllHotels([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setAllHotels([]);
    setHasMore(true);
    setInfoMap({});
    setPriceMaxFilter(999999);
    setMaxPriceAvail(5000);
    infoLoadingRef.current = new Set();
    seenCodesRef.current   = new Set();
    paginationRef.current  = { page: 1, hasMore: true, fetching: true };

    const url = `${CONTRACTS_API}/contracts/cheapest?${buildQS(fetchParams, destCode, childAges, 1)}`;
    console.log('[Results] Initial fetch:', url);

    let cancelled = false;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const results    = data.results || [];
        const nightCount = data.nights  || 0;
        setNights(nightCount);

        const seen   = seenCodesRef.current;
        const mapped = [];
        for (const c of results) {
          if (!seen.has(c.hotelCode)) {
            seen.add(c.hotelCode);
            mapped.push(mapContract(c, destinationLabel, mapped.length));
          }
        }

        if (mapped.length > 0) {
          const max     = Math.max(...mapped.map((h) => h.totalAmount));
          const rounded = Math.ceil(max / 100) * 100;
          setMaxPriceAvail((prev) => Math.max(prev, rounded));
        }

        // Use the API's own hasMore flag; fall back to result count check
        const more = data.hasMore ?? (results.length >= PAGE_SIZE);
        paginationRef.current = { page: 2, hasMore: more, fetching: false };
        setHasMore(more);
        setAllHotels(mapped);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[Results] Contracts API error:', err);
        setAllHotels([]);
        setHasMore(false);
        setLoading(false);
        paginationRef.current = { page: 1, hasMore: false, fetching: false };
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destCode, fetchParams]);

  // Load next page from API
  const loadMore = useCallback(() => {
    const pg = paginationRef.current;
    if (!pg.hasMore || pg.fetching) return;

    paginationRef.current = { ...pg, fetching: true };
    setFetchingMore(true);

    const fp  = fetchParamsRef.current;
    const dc  = destCodeRef.current;
    const ca  = childAgesRef.current;
    const lbl = destLabelRef.current;
    const url = `${CONTRACTS_API}/contracts/cheapest?${buildQS(fp, dc, ca, pg.page)}`;
    console.log('[Results] Load more (page=' + pg.page + '):', url);

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const results = data.results || [];
        const seen    = seenCodesRef.current;

        // Dedup OUTSIDE the state updater: seen.add() is a mutation, and React
        // StrictMode double-invokes updater functions in dev — doing it inside
        // would make the 2nd invocation see the codes already added and append
        // nothing, wiping the new page. Build the new items here (once), then
        // append with a pure updater.
        const newCards = [];
        for (const c of results) {
          if (!seen.has(c.hotelCode)) {
            seen.add(c.hotelCode);
            newCards.push(c);
          }
        }

        if (newCards.length > 0) {
          setAllHotels((prev) => [
            ...prev,
            ...newCards.map((c, i) => mapContract(c, lbl, prev.length + i)),
          ]);
          const newMax = Math.max(...newCards.map((r) => r.totalAmount));
          setMaxPriceAvail((prev) => Math.max(prev, Math.ceil(newMax / 100) * 100));
        }

        const more = data.hasMore ?? (results.length >= PAGE_SIZE);
        paginationRef.current = { page: pg.page + 1, hasMore: more, fetching: false };
        setHasMore(more);
        setFetchingMore(false);
      })
      .catch((err) => {
        console.error('[Results] Load more error:', err);
        paginationRef.current = { ...paginationRef.current, fetching: false };
        setFetchingMore(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Client-side filter + sort
  useEffect(() => {
    let data = [...allHotels];

    if (boardFilter.length > 0) {
      data = data.filter((h) => boardFilter.includes(h.board));
    }
    if (classFilter.length > 0) {
      data = data.filter((h) => classFilter.includes(h.classification));
    }
    data = data.filter((h) => h.totalAmount <= priceMaxFilter);

    if (sort === 'Price: High to Low') {
      data.sort((a, b) => b.totalAmount - a.totalAmount);
    } else {
      data.sort((a, b) => a.totalAmount - b.totalAmount);
    }

    setHotels(data);
  }, [allHotels, boardFilter, classFilter, priceMaxFilter, sort]);

  // Lazily load real hotel info (name/images/stars) for all visible hotels
  useEffect(() => {
    const need = hotels
      .map((h) => String(h.hotelCode))
      .filter((code) => !infoMap[code] && !infoLoadingRef.current.has(code));
    if (need.length === 0) return;

    need.forEach((c) => infoLoadingRef.current.add(c));
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${CONTRACTS_API}/hotels/bulk`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ hotelCodes: need }),
        });
        if (res.ok) {
          const data = await res.json();
          const add = {};
          for (const info of (data?.data ?? [])) add[String(info.hotelCode)] = info;
          if (!cancelled && Object.keys(add).length) setInfoMap((prev) => ({ ...prev, ...add }));
        }
      } catch (e) {
        console.warn('[Results] Hotel info bulk failed:', e);
      } finally {
        need.forEach((c) => infoLoadingRef.current.delete(c));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotels]);

  // Infinite scroll — IntersectionObserver on sentinel.
  // Re-runs when allHotels.length changes so it reconnects after each page
  // load and fires immediately if the sentinel is still in view (short page).
  useEffect(() => {
    if (loading || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, hasMore, allHotels.length, loadMore]);

  const toggleLike  = (id) => setLiked((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleBoard = (b)  => setBoardFilter((prev) => prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]);
  const toggleClass = (c)  => setClassFilter((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  const applySearch = () => {
    setFetchParams((prev) => ({
      ...prev,
      checkIn:  localCheckIn,
      checkOut: localCheckOut,
      adults:   String(localAdults),
      children: String(localChildren),
      rooms:    String(localRooms),
    }));
  };

  const guestSummary = `${fetchParams.adults} Adult${fetchParams.adults !== '1' ? 's' : ''}${fetchParams.children !== '0' ? `, ${fetchParams.children} Child${fetchParams.children !== '1' ? 'ren' : ''}` : ''}`;

  const heroChips = [];
  if (fetchParams.checkIn && fetchParams.checkOut) {
    heroChips.push({
      icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
      text: `${fmtDate(fetchParams.checkIn)} — ${fmtDate(fetchParams.checkOut)}`,
    });
  }
  if (nights > 0) {
    heroChips.push({
      icon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
      text: `${nights} nights`,
    });
  }
  heroChips.push({
    icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
    text: guestSummary,
  });

  const sidebar = (
    <>
      {/* Dates & Guests — re-calls API */}
      <FilterSection title="Dates & Guests" defaultOpen>
        <div className={styles.dateGroup}>
          <label className={styles.dateLabel}>Check-in</label>
          <input
            type="date"
            className={styles.dateInput}
            value={localCheckIn}
            min={new Date().toISOString().split('T')[0]}
            onChange={(e) => setLocalCheckIn(e.target.value)}
          />
        </div>
        <div className={styles.dateGroup}>
          <label className={styles.dateLabel}>Check-out</label>
          <input
            type="date"
            className={styles.dateInput}
            value={localCheckOut}
            min={localCheckIn || new Date().toISOString().split('T')[0]}
            onChange={(e) => setLocalCheckOut(e.target.value)}
          />
        </div>
        <div className={styles.guestRow}>
          <span className={styles.guestLabel}>Adults</span>
          <div className={styles.guestCounter}>
            <button className={styles.guestBtn} onClick={() => setLocalAdults((a) => { const n = Math.max(1, a - 1); setLocalRooms((r) => Math.min(r, n)); return n; })}>−</button>
            <span className={styles.guestNum}>{localAdults}</span>
            <button className={styles.guestBtn} onClick={() => setLocalAdults((a) => Math.min(9, a + 1))}>+</button>
          </div>
        </div>
        <div className={styles.guestRow}>
          <span className={styles.guestLabel}>Children</span>
          <div className={styles.guestCounter}>
            <button className={styles.guestBtn} onClick={() => setLocalChildren((c) => Math.max(0, c - 1))}>−</button>
            <span className={styles.guestNum}>{localChildren}</span>
            <button className={styles.guestBtn} onClick={() => setLocalChildren((c) => Math.min(6, c + 1))}>+</button>
          </div>
        </div>
        <div className={styles.guestRow}>
          <span className={styles.guestLabel}>Rooms</span>
          <div className={styles.guestCounter}>
            <button className={styles.guestBtn} onClick={() => setLocalRooms((r) => Math.max(1, r - 1))}>−</button>
            <span className={styles.guestNum}>{localRooms}</span>
            <button className={styles.guestBtn} onClick={() => setLocalRooms((r) => Math.min(localAdults, r + 1))}>+</button>
          </div>
        </div>
        <button className={styles.applyBtn} onClick={applySearch}>
          <Icon d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" size={13} sw={2.2} />
          Update Search
        </button>
      </FilterSection>

      {/* Price Range — client-side */}
      <FilterSection title="Price Range" defaultOpen>
        <div className={styles.priceSliderWrap}>
          <input
            type="range"
            className={styles.filterRange}
            min={0}
            max={maxPriceAvail}
            step={50}
            value={Math.min(priceMaxFilter, maxPriceAvail)}
            onChange={(e) => setPriceMaxFilter(Number(e.target.value))}
            style={{ '--fill': `${(Math.min(priceMaxFilter, maxPriceAvail) / (maxPriceAvail || 1)) * 100}%` }}
          />
          <div className={styles.priceSliderLabels}>
            <span>0</span>
            <span className={styles.priceSliderCurrent}>
              Up to {allHotels[0]?.currency || 'EUR'} {Math.min(priceMaxFilter, maxPriceAvail).toLocaleString()}
            </span>
            <span>{maxPriceAvail.toLocaleString()}</span>
          </div>
        </div>
      </FilterSection>

      {/* Board Type — client-side */}
      <FilterSection title="Board Type" defaultOpen>
        {BOARD_FILTER_OPTIONS.map((b) => (
          <FilterCheck key={b} label={b} checked={boardFilter.includes(b)} onChange={() => toggleBoard(b)} />
        ))}
      </FilterSection>

      {/* Rate Type — client-side */}
      <FilterSection title="Rate Type" defaultOpen={false}>
        <FilterCheck label="Refundable (NOR)"     checked={classFilter.includes('NOR')} onChange={() => toggleClass('NOR')} />
        <FilterCheck label="Non-Refundable (NRF)" checked={classFilter.includes('NRF')} onChange={() => toggleClass('NRF')} />
      </FilterSection>
    </>
  );

  return (
    <div className={styles.page}>
      {/* Hero header */}
      <header className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroGlow2} />
        <div className={styles.heroGrid} />
        <svg className={styles.heroFlight} viewBox="0 0 600 200" fill="none" aria-hidden="true">
          <path
            className={styles.flightPath}
            d="M10 160 Q 220 30 590 70"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="2 12"
          />
          <g className={styles.flightPlane}>
            <path d="M0 8L22 0l-7.5 18-3.5-6.5L0 8z" fill="rgba(255,255,255,0.9)" transform="translate(-11,-9)" />
          </g>
        </svg>
        <span className={styles.twinkle} style={{ top: '24%', left: '38%' }} />
        <span className={styles.twinkle} style={{ top: '58%', left: '55%', animationDelay: '1.2s' }} />
        <span className={styles.twinkle} style={{ top: '18%', left: '72%', animationDelay: '2.1s' }} />
        <span className={styles.twinkle} style={{ top: '64%', left: '86%', animationDelay: '0.6s' }} />
        <div className={styles.heroInner}>
          <div className={styles.breadcrumb}>
            <span>Home</span>
            <span className={styles.bcSep}>·</span>
            <span>Holidays</span>
            <span className={styles.bcSep}>·</span>
            <span className={styles.bcActive}>{destinationLabel || 'Results'}</span>
          </div>
          <h1 className={styles.heroTitle}>
            {destinationLabel ? (
              <>Stays in <em>{destinationLabel}</em></>
            ) : (
              'Find your perfect stay'
            )}
          </h1>
          <div className={styles.heroChips}>
            {heroChips.map((c) => (
              <span key={c.text} className={styles.heroChip}>
                <Icon d={c.icon} size={13} sw={1.8} />
                {c.text}
              </span>
            ))}
          </div>
        </div>
        <div className={styles.heroWave}>
          <svg viewBox="0 0 1440 60" preserveAspectRatio="none">
            <path d="M0,30 C240,60 480,0 720,20 C960,40 1200,10 1440,35 L1440,60 L0,60 Z" fill="currentColor" />
          </svg>
        </div>
      </header>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarInner}>
          <div className={styles.resultCount}>
            {loading ? (
              <span className={styles.countSearching}>
                <span className={styles.countPulse} />
                Searching the best deals…
              </span>
            ) : (
              <><strong>{hotels.length}</strong> {hotels.length === 1 ? 'stay' : 'stays'} found{hasMore ? '+' : ''}</>
            )}
          </div>
          <div className={styles.toolbarRight}>
            <div className={styles.sortWrap}>
              <span className={styles.sortLabel}>
                <Icon d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4" size={14} sw={2} />
                Sort
              </span>
              <select className={styles.sortSelect} value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORT_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <button className={styles.mobileFilterBtn} onClick={() => setDrawerOpen(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
              </svg>
              Filters
            </button>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className={styles.main}>
        <aside className={styles.sidebar}>
          <div className={styles.filterCard}>
            <div className={styles.filterCardHead}>
              <Icon d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" size={15} sw={2} />
              <h2>Filters</h2>
            </div>
            {sidebar}
          </div>
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
                    <div className={`${styles.skeletonLine} ${styles.skW30}`} />
                  </div>
                  <div className={styles.skeletonRail}>
                    <div className={`${styles.skeletonLine} ${styles.skRail1}`} />
                    <div className={`${styles.skeletonLine} ${styles.skRail2}`} />
                  </div>
                </div>
              ))
            ) : !destCode ? (
              <div className={styles.noResults}>
                <div className={styles.noResultsIcon}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <h3>Select a destination</h3>
                <p>Use the search form to find available holidays.</p>
              </div>
            ) : hotels.length === 0 ? (
              <div className={styles.noResults}>
                <div className={styles.noResultsIcon}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                  </svg>
                </div>
                <h3>No results found</h3>
                <p>Try a different destination, dates, or adjust your filters.</p>
              </div>
            ) : (
              hotels.map((h, i) => {
                const info      = infoMap[String(h.hotelCode)];
                const dispName  = info?.name?.trim() || h.name;
                const dispStars = info?.stars ?? h.stars;
                const dispImg   = info ? bestImg(info.images, FALLBACK_IMG) : h.img;
                const infoReady = !!info;
                return (
                <article key={h.id} className={styles.resultCard} style={{ animationDelay: `${Math.min(i % PAGE_SIZE, 8) * 0.06}s` }}>
                  {/* Image column */}
                  <div className={styles.rcImg}>
                    {infoReady
                      ? <img src={dispImg} alt={dispName} loading="lazy" onError={(e) => { e.currentTarget.src = FALLBACK_IMG; }} />
                      : <div className={styles.rcImgSkel} />}
                    <div className={styles.rcImgOverlay} />
                    <div className={styles.rcBadge}>
                      <Icon d="M13 10V3L4 14h7v7l9-11h-7z" size={11} sw={2} />
                      {h.badge}
                    </div>
                    <button
                      className={`${styles.rcHeart} ${liked[h.id] ? styles.rcHeartLiked : ''}`}
                      onClick={() => toggleLike(h.id)}
                      aria-label="Save to favourites"
                    >
                      <svg width="17" height="17" viewBox="0 0 24 24" fill={liked[h.id] ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                      </svg>
                    </button>
                    {h.classification === 'NRF' && (
                      <div className={styles.rcNrfChip}>Non-Refundable</div>
                    )}
                  </div>

                  {/* Content column */}
                  <div className={styles.rcContent}>
                    {dispStars > 0 && (
                      <div className={styles.rcStars}>
                        {'★'.repeat(Math.min(dispStars, 5))}
                        <span className={styles.rcStarLabel}>{Math.min(dispStars, 5)}-star hotel</span>
                      </div>
                    )}
                    {infoReady
                      ? <h3 className={styles.rcName}>{dispName}</h3>
                      : <div className={`${styles.rcNameSkel} ${styles.skeletonLine}`} />}
                    <div className={styles.rcLocation}>
                      <Icon d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 13a3 3 0 100-6 3 3 0 000 6z" size={13} sw={1.6} />
                      {h.loc}
                    </div>

                    {h.boardTags.length > 0 && (
                      <div className={styles.rcAmenities}>
                        {h.boardTags.map((b) => (
                          <span key={b} className={styles.rcAmenity}>
                            <CheckIcon />{b}
                          </span>
                        ))}
                        {h.roomType && (
                          <span className={styles.rcAmenity}>
                            <CheckIcon />{h.roomType}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Trip details */}
                    <div className={styles.rcTrip}>
                      {fetchParams.checkIn && (
                        <div className={styles.rcTripDates}>
                          <Icon d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" size={13} sw={1.6} />
                          <span>{fmtDate(fetchParams.checkIn)}</span>
                          <span className={styles.rcTripSep}>→</span>
                          <span>{fmtDate(fetchParams.checkOut)}</span>
                        </div>
                      )}
                      {nights > 0 && (
                        <span className={styles.rcTripPill}>
                          <Icon d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" size={11} sw={2} />
                          {nights} nights
                        </span>
                      )}
                      <span className={`${styles.rcTripPill} ${styles.rcTripTransfer}`}>
                        <Icon d="M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3M13 17l4 4 4-4M17 21v-9" size={11} sw={2} />
                        Transfer incl.
                      </span>
                    </div>
                  </div>

                  {/* Price rail */}
                  <div className={styles.rcPriceRail}>
                    <div className={styles.rcPriceTop}>
                      {h.contractName && (
                        <span className={styles.rcContractBadge}>{h.contractName}</span>
                      )}
                    </div>
                    <div className={styles.rcPriceInfo}>
                      <span className={styles.rcPriceLabel}>
                        Total{nights > 0 ? ` · ${nights} nights` : ''}
                      </span>
                      <div className={styles.rcPriceAmount}>
                        <span className={styles.rcPriceCcy}>{h.currency}</span>
                        {h.totalAmount?.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {nights > 0 && (
                        <div className={styles.rcPriceMeta}>
                          <strong>{h.currency} {(h.totalAmount / nights).toFixed(2)}</strong> / night
                        </div>
                      )}
                      <button
                        className={styles.rcCta}
                        onClick={() => navigate(`/hotel/${h.hotelCode}`, {
                          state: {
                            hotel: { ...h, name: dispName, stars: dispStars, img: dispImg },
                            info,
                            destination: destCode,
                            nights,
                            checkIn: fetchParams.checkIn,
                            checkOut: fetchParams.checkOut,
                            adults: fetchParams.adults,
                            children: fetchParams.children,
                            rooms: fetchParams.rooms,
                          },
                        })}
                      >
                        View Deal
                        <Icon d="M5 12h14M12 5l7 7-7 7" size={14} sw={2.2} />
                      </button>
                    </div>
                  </div>
                </article>
                );
              })
            )}

            {/* Invisible sentinel — IntersectionObserver anchor, always present while more pages exist */}
            {!loading && hasMore && <div ref={sentinelRef} style={{ height: '1px' }} />}
            {/* Spinner — only shown while a page fetch is actually in flight */}
            {!loading && fetchingMore && (
              <div className={styles.loadMore}>
                <span className={styles.loadMoreSpin} />
                Loading more stays…
              </div>
            )}
            {/* End of results — no more pages to load */}
            {!loading && !hasMore && hotels.length > 0 && (
              <div className={styles.endOfResults}>
                You’ve reached the end — all {hotels.length} stays shown
              </div>
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
