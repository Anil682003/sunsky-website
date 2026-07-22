import { useState, useRef, useEffect } from 'react';
import { searchDestinationsAndHotels } from '../../api/filters';
import styles from './DestinationSearch.module.css';

// One search box for the home page that finds BOTH destinations and hotels by name and groups
// them (📍 Destinations, 🏨 Hotels). Picking a destination selects it; picking a hotel selects
// that specific hotel. "Browse all destinations" opens the multi-select modal for power users.

const PinIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
  </svg>
);
const HotelIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16" /><path d="M9 7h.01M13 7h.01M9 11h.01M13 11h.01M9 15h6v6H9z" />
  </svg>
);
const stars = (n) => (n > 0 ? ' · ' + '★'.repeat(Math.min(n, 5)) : '');

export default function DestinationSearch({ label = 'Destination', displayText = '', onSelect, onBrowseAll }) {
  const [query, setQuery]     = useState(displayText);
  const [results, setResults] = useState({ destinations: [], hotels: [] });
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive]   = useState(-1);
  const boxRef = useRef(null);
  const reqRef = useRef(0);

  // Sync when the committed selection changes externally (e.g. the "Browse all" modal applied).
  const [prevText, setPrevText] = useState(displayText);
  if (displayText !== prevText) { setPrevText(displayText); setQuery(displayText); }

  // Debounced search — only the latest request's result is applied (reqRef guards races).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults({ destinations: [], hotels: [] }); setLoading(false); return; }
    setLoading(true);
    const id = ++reqRef.current;
    const t = setTimeout(async () => {
      const r = await searchDestinationsAndHotels(q);
      if (id === reqRef.current) { setResults(r); setLoading(false); }
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Flat list in render order (destinations then hotels) so keyboard nav maps to what's shown.
  const flat = [
    ...results.destinations.map((d) => ({ kind: 'destination', ...d })),
    ...results.hotels.map((h) => ({ kind: 'hotel', ...h })),
  ];

  const choose = (item) => {
    setQuery(item.name);
    setOpen(false);
    setActive(-1);
    if (item.kind === 'destination') {
      onSelect({ type: 'destination', code: item.code, name: item.name, country: item.country });
    } else {
      onSelect({ type: 'hotel', hotelCode: item.hotelCode, name: item.name, destinationCode: item.destinationCode, destinationName: item.destinationName });
    }
  };

  const clear = () => { setQuery(''); setResults({ destinations: [], hotels: [] }); setActive(-1); onSelect(null); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && active >= 0 && flat[active]) { e.preventDefault(); choose(flat[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  const showDrop = open && query.trim().length >= 2;

  return (
    <div className={styles.wrap} ref={boxRef}>
      <span className={styles.icon}><PinIcon /></span>
      <div className={styles.field}>
        <span className={styles.label}>{label}</span>
        <input
          className={styles.input}
          value={query}
          placeholder="Search a hotel or destination…"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          aria-label="Search a hotel or destination"
          autoComplete="off"
        />
      </div>
      {query && <button type="button" className={styles.clear} onClick={clear} aria-label="Clear">×</button>}

      {showDrop && (
        <div className={styles.dropdown}>
          {loading && flat.length === 0 && <div className={styles.state}>Searching…</div>}
          {!loading && flat.length === 0 && <div className={styles.state}>No hotels or destinations match “{query.trim()}”.</div>}

          {results.destinations.length > 0 && (
            <>
              <div className={styles.group}>Destinations</div>
              {results.destinations.map((d, i) => (
                <button
                  key={`d-${d.code}`} type="button"
                  className={`${styles.item} ${active === i ? styles.itemActive : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose({ kind: 'destination', ...d })}
                >
                  <span className={`${styles.itemIcon} ${styles.iconDest}`}><PinIcon /></span>
                  <span className={styles.itemText}>
                    <span className={styles.itemMain}>{d.name}</span>
                    <span className={styles.itemSub}>{d.country ? `${d.country} · ` : ''}Destination</span>
                  </span>
                </button>
              ))}
            </>
          )}

          {results.hotels.length > 0 && (
            <>
              <div className={styles.group}>Hotels</div>
              {results.hotels.map((h, i) => {
                const idx = results.destinations.length + i;
                return (
                  <button
                    key={`h-${h.hotelCode}`} type="button"
                    className={`${styles.item} ${active === idx ? styles.itemActive : ''}`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => choose({ kind: 'hotel', ...h })}
                  >
                    <span className={`${styles.itemIcon} ${styles.iconHotel}`}><HotelIcon /></span>
                    <span className={styles.itemText}>
                      <span className={styles.itemMain}>{h.name}{stars(h.stars)}</span>
                      <span className={styles.itemSub}>{h.destinationName}{h.country ? `, ${h.country}` : ''} · Hotel</span>
                    </span>
                  </button>
                );
              })}
            </>
          )}

          {onBrowseAll && (
            <button type="button" className={styles.browse} onClick={() => { setOpen(false); onBrowseAll(); }}>
              Browse all destinations →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
