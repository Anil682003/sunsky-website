import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import styles from './Search.module.css';

const CONTRACTS_API = import.meta.env.VITE_CACHE_API_URL || 'http://91.134.71.79:3001';

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
      {label}
    </label>
  );
}

export default function Search() {
  const [params] = useSearchParams();

  const destCode         = params.get('destination')      || '';
  const destinationLabel = params.get('destinationLabel') || destCode;

  const defaultCheckIn  = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
  const defaultCheckOut = (() => { const d = new Date(); d.setDate(d.getDate() + 37); return d.toISOString().split('T')[0]; })();

  const initCheckIn  = params.get('checkIn')  || defaultCheckIn;
  const initCheckOut = params.get('checkOut') || defaultCheckOut;
  const initAdults   = params.get('adults')   || '2';
  const initChildren = params.get('children') || '0';

  // Sidebar draft state (not yet fetched)
  const [localCheckIn,  setLocalCheckIn]  = useState(initCheckIn);
  const [localCheckOut, setLocalCheckOut] = useState(initCheckOut);
  const [localAdults,   setLocalAdults]   = useState(parseInt(initAdults));
  const [localChildren, setLocalChildren] = useState(parseInt(initChildren));

  // Committed params that drive the API fetch
  const [fetchParams, setFetchParams] = useState({
    checkIn: initCheckIn, checkOut: initCheckOut,
    adults: initAdults, children: initChildren,
  });

  const [sort, setSort]               = useState('Price: Low to High');
  const [loading, setLoading]         = useState(true);
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

  // Fetch from contracts API
  useEffect(() => {
    if (!destCode) {
      setHotels([]);
      setAllHotels([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const qs = new URLSearchParams({
      destination:        destCode,
      checkIn:            fetchParams.checkIn,
      checkOut:           fetchParams.checkOut,
      adults:             fetchParams.adults,
      children:           fetchParams.children,
      rooms:              '1',
      limit:              '50',
      source:             'combined',
      maxAdultsPerRoom:   fetchParams.adults,
      maxChildrenPerRoom: fetchParams.children,
    });

    const fullUrl = `${CONTRACTS_API}/contracts/cheapest?${qs.toString()}`;
    console.log('[Search] Calling contracts API:', fullUrl);

    fetch(fullUrl)
      .then((r) => r.json())
      .then(async (data) => {
        const results    = data.results || [];
        const nightCount = data.nights  || 0;
        setNights(nightCount);

        // Group by hotelCode — keep cheapest contract per hotel
        const hotelMap = new Map();
        for (const c of results) {
          const existing = hotelMap.get(c.hotelCode);
          if (!existing || c.totalAmount < existing.totalAmount) {
            hotelMap.set(c.hotelCode, c);
          }
        }

        const contracts  = [...hotelMap.values()];
        const hotelCodes = contracts.map((c) => c.hotelCode);

        // Fetch real hotel names, images, stars in bulk
        let infoMap = {};
        try {
          const infoRes = await fetch(`${CONTRACTS_API}/hotels/bulk`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ hotelCodes }),
          });
          if (infoRes.ok) {
            const infoData = await infoRes.json();
            for (const info of (infoData?.data ?? [])) {
              infoMap[String(info.hotelCode)] = info;
            }
          }
        } catch (e) {
          console.warn('[Search] Hotel bulk info failed:', e);
        }

        const mapped = contracts.map((c, i) => {
          const info    = infoMap[String(c.hotelCode)];
          const images  = (info?.images ?? []).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
          const imgUrl  = images[0]?.url || FALLBACK_IMG;
          return {
            id:           c.hotelCode,
            hotelCode:    c.hotelCode,
            name:         info?.name ?? c.hotelName ?? `Hotel ${c.hotelCode}`,
            stars:        info?.stars ?? null,
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
            badge:        BADGES[i % BADGES.length],
            img:          imgUrl,
            loc:          destinationLabel,
          };
        });

        // Compute price range for slider
        if (mapped.length > 0) {
          const max     = Math.max(...mapped.map((h) => h.totalAmount));
          const rounded = Math.ceil(max / 100) * 100;
          setMaxPriceAvail(rounded);
          setPriceMaxFilter(rounded);
        }

        setAllHotels(mapped);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[Search] Contracts API error:', err);
        setAllHotels([]);
        setLoading(false);
      });
  }, [destCode, fetchParams]);

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

  const toggleLike  = (id) => setLiked((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleBoard = (b)  => setBoardFilter((prev) => prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]);
  const toggleClass = (c)  => setClassFilter((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  const applySearch = () => {
    setFetchParams({
      checkIn:  localCheckIn,
      checkOut: localCheckOut,
      adults:   String(localAdults),
      children: String(localChildren),
    });
  };

  const chips = [];
  if (destinationLabel) chips.push(destinationLabel);
  if (fetchParams.checkIn)  chips.push(fmtDate(fetchParams.checkIn));
  if (fetchParams.checkOut) chips.push(fmtDate(fetchParams.checkOut));
  if (nights > 0) chips.push(`${nights} nights`);
  chips.push(`${fetchParams.adults} Adult${fetchParams.adults !== '1' ? 's' : ''}${fetchParams.children !== '0' ? `, ${fetchParams.children} Child${fetchParams.children !== '1' ? 'ren' : ''}` : ''}`);

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
            <button className={styles.guestBtn} onClick={() => setLocalAdults((a) => Math.max(1, a - 1))}>−</button>
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
        <button className={styles.applyBtn} onClick={applySearch}>
          <Icon d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" size={13} sw={2.2} />
          Search
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
      {/* Summary bar */}
      <div className={styles.summaryBar}>
        <div className={styles.summaryInner}>
          <div className={styles.summaryLeft}>
            <div className={styles.summaryCount}>
              <span>{loading ? '…' : hotels.length}</span> Results Found
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

      {/* Main layout */}
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
                    <div className={`${styles.skeletonLine} ${styles.skW30}`} />
                  </div>
                </div>
              ))
            ) : !destCode ? (
              <div className={styles.noResults}>
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                <h3>Select a destination</h3>
                <p>Use the search form to find available holidays.</p>
              </div>
            ) : hotels.length === 0 ? (
              <div className={styles.noResults}>
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                <h3>No results found</h3>
                <p>Try a different destination, dates, or adjust your filters.</p>
              </div>
            ) : (
              hotels.map((h, i) => (
                <div key={h.id} className={styles.resultCard} style={{ animationDelay: `${i * 0.06}s` }}>
                  {/* Image column */}
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
                    {h.classification === 'NRF' && (
                      <div className={styles.rcNrfChip}>Non-Refundable</div>
                    )}
                  </div>

                  {/* Content column */}
                  <div className={styles.rcContent}>
                    <div className={styles.rcTop}>
                      <div className={styles.rcTopLeft}>
                        <h3 className={styles.rcName}>{h.name}</h3>
                        {h.stars > 0 && (
                          <div className={styles.rcStars}>
                            {'★'.repeat(Math.min(h.stars, 5))}
                          </div>
                        )}
                        <div className={styles.rcLocation}>
                          <Icon d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 13a3 3 0 100-6 3 3 0 000 6z" size={13} sw={1.6} />
                          {h.loc}
                        </div>
                      </div>
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

                    {/* Price + CTA */}
                    <div className={styles.rcPriceBox}>
                      <div className={styles.rcPriceInfo}>
                        <div className={styles.rcPriceAmount}>
                          <span className={styles.rcPriceCcy}>{h.currency}</span>
                          {h.totalAmount?.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className={styles.rcPriceMeta}>
                          Total price
                          {nights > 0 && (
                            <> · <strong>{h.currency} {(h.totalAmount / nights).toFixed(2)}</strong>/night</>
                          )}
                        </div>
                        {h.contractName && (
                          <span className={styles.rcContractBadge}>{h.contractName}</span>
                        )}
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
