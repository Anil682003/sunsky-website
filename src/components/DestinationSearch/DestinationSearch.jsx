import { useState, useRef, useEffect, useCallback } from 'react';
import { searchDestinationsAndHotels } from '../../api/filters';
import styles from './DestinationSearch.module.css';

// One search box that finds BOTH hotels and destinations by name and groups them (🏨 Hotels first,
// then 📍 Destinations). Picking a hotel pins that specific hotel; picking a destination selects it.
// Used in the site header — a compact pill that drops a rich typeahead. onSelect receives
// { type:'hotel', hotelCode, name, destinationCode, destinationName, country, stars, image } or
// { type:'destination', code, name, country }, and null when cleared.
//
// Each hotel row shows that hotel's MASTER image (its primary photo in the admin) as the row
// thumbnail — a traveller recognises the place far faster than a name. About 8% of hotels have
// no photo, and any URL can 404, so the generic icon stays as the fallback in both cases.

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7.5" /><path d="M21 21l-4.3-4.3" />
  </svg>
);
const PinIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
  </svg>
);
const HotelIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16" /><path d="M9 7h.01M13 7h.01M9 11h.01M13 11h.01M9 15h6v6H9z" />
  </svg>
);

// Small gold star row for a hotel's rating (rendered as its own element rather than glued to the name).
const Stars = ({ n }) => {
  const count = Math.max(0, Math.min(5, Math.round(n || 0)));
  if (!count) return null;
  return (
    <span className={styles.stars} aria-label={`${count} star`}>
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.6 5.9 20.4l1.4-6.8L2.2 9l6.9-.7z" />
        </svg>
      ))}
    </span>
  );
};

// A typed word is re-searched constantly — backspacing, re-typing, reopening the box. Holding the
// last handful of answers makes those instant and silent. Small and per-mount on purpose: it is a
// keystroke buffer, not a data store, so it can never serve a stale list into a later session.
const CACHE_MAX = 30;

// Some source names carry stray whitespace; trim so the field, the label and the results
// banner never render a doubled space ("Stays in  Ana y Jose…").
const normalise = (r) => ({
  hotels: (r?.hotels || []).map((h) => ({ ...h, name: (h.name || '').trim() })),
  destinations: (r?.destinations || []).map((d) => ({ ...d, name: (d.name || '').trim() })),
});

const EMPTY = { destinations: [], hotels: [] };

export default function DestinationSearch({ onSelect, onBrowseAll, autoFocus = false, placeholder = 'Search hotels & destinations' }) {
  const [query, setQuery]     = useState('');
  // The last SETTLED answer, tagged with the query it belongs to. What the dropdown shows and
  // whether it is loading are DERIVED from this plus the current query — so an empty box or a
  // cache hit needs no state update at all, and there is no render-then-correct flash.
  const [settled, setSettled] = useState({ query: '', results: EMPTY });
  const [open, setOpen]       = useState(false);
  const [active, setActive]   = useState(-1);
  // Hotels whose thumbnail failed to load — keyed by hotelCode so the row falls back to the
  // icon instead of showing a broken frame, and stays fallen back if the list re-renders.
  const [brokenImg, setBrokenImg] = useState({});
  // Answers already seen this session. State rather than a ref because it is READ DURING RENDER
  // to decide what the dropdown shows — reading a ref there is not safe under concurrent
  // rendering. Bounded, so a long typing session cannot grow it without limit.
  const [cache, setCache] = useState(() => new Map());
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const reqRef = useRef(0);
  // The request in flight, so a superseded keystroke is CANCELLED rather than left to land.
  const abortRef = useRef(null);

  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  // Abort whatever is still in flight when the box unmounts (navigating away mid-type).
  useEffect(() => () => abortRef.current?.abort(), []);

  const markBroken = useCallback((code) => {
    setBrokenImg((m) => (m[code] ? m : { ...m, [code]: true }));
  }, []);

  const q = query.trim();
  const cached = q.length >= 2 ? cache.get(q) : null;
  // Below the 2-character floor there is nothing to show. Otherwise: a cached answer wins,
  // else the last settled one — which keeps the previous matches on screen while a newer
  // keystroke loads, instead of blanking the list between every letter.
  const results = q.length < 2 ? EMPTY : (cached ?? settled.results);
  // Loading = the current query has no answer yet, from either source.
  const loading = q.length >= 2 && !cached && settled.query !== q;

  // Debounced search — only the latest request's result is applied (reqRef guards races, and
  // the AbortController stops the superseded request from occupying the network at all).
  useEffect(() => {
    const term = query.trim();
    // Nothing to fetch: too short, or already answered from the cache. Drop any in-flight
    // request on the floor — its answer can no longer be the one on screen.
    if (term.length < 2 || cache.has(term)) {
      reqRef.current++;
      abortRef.current?.abort();
      return;
    }
    const id = ++reqRef.current;
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const r = await searchDestinationsAndHotels(term, 6, { signal: ctrl.signal });
      if (id !== reqRef.current) return;   // a newer keystroke already owns the box
      const next = normalise(r);
      // Don't cache an empty result: it is indistinguishable from "the request was aborted",
      // and caching that would wedge a query into looking like it has no matches.
      if (next.hotels.length || next.destinations.length) {
        setCache((prev) => {
          const m = new Map(prev);
          m.set(term, next);
          // Map keeps insertion order, so the first key is the oldest.
          while (m.size > CACHE_MAX) m.delete(m.keys().next().value);
          return m;
        });
      }
      setSettled({ query: term, results: next });
    }, 220);
    return () => clearTimeout(t);
  }, [query, cache]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Flat list in render order (HOTELS then destinations) so keyboard nav maps to what's shown.
  const flat = [
    ...results.hotels.map((h) => ({ kind: 'hotel', ...h })),
    ...results.destinations.map((d) => ({ kind: 'destination', ...d })),
  ];

  const choose = (item) => {
    setQuery(item.name);
    setOpen(false);
    setActive(-1);
    if (item.kind === 'hotel') {
      onSelect({ type: 'hotel', hotelCode: item.hotelCode, name: item.name, destinationCode: item.destinationCode, destinationName: item.destinationName, country: item.country, stars: item.stars, image: item.image ?? null });
    } else {
      onSelect({ type: 'destination', code: item.code, name: item.name, country: item.country });
    }
  };

  const clear = () => { setQuery(''); setActive(-1); onSelect(null); inputRef.current?.focus(); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && active >= 0 && flat[active]) { e.preventDefault(); choose(flat[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  const showDrop = open && q.length >= 2;
  const nHotels = results.hotels.length;

  return (
    <div className={styles.wrap} ref={boxRef}>
      <span className={styles.icon}><SearchIcon /></span>
      <input
        ref={inputRef}
        className={styles.input}
        value={query}
        placeholder={placeholder}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        aria-label="Search hotels and destinations"
        autoComplete="off"
      />
      {query && <button type="button" className={styles.clear} onClick={clear} aria-label="Clear">×</button>}

      {showDrop && (
        <div className={styles.dropdown}>
          {loading && flat.length === 0 && (
            <div className={styles.state}><span className={styles.spinner} />Searching…</div>
          )}
          {!loading && flat.length === 0 && (
            <div className={styles.state}>No hotels or destinations match “{q}”.</div>
          )}

          {results.hotels.length > 0 && (
            <div className={styles.section}>
              <div className={styles.group}><HotelIcon /><span>Hotels</span></div>
              {results.hotels.map((h, i) => (
                <button
                  key={`h-${h.hotelCode}`} type="button"
                  className={`${styles.item} ${active === i ? styles.itemActive : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose({ kind: 'hotel', ...h })}
                >
                  {h.image && !brokenImg[h.hotelCode] ? (
                    <span className={`${styles.itemIcon} ${styles.itemThumb}`}>
                      <img
                        src={h.image}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        aria-hidden="true"
                        onError={() => markBroken(h.hotelCode)}
                      />
                    </span>
                  ) : (
                    <span className={`${styles.itemIcon} ${styles.iconHotel}`}><HotelIcon /></span>
                  )}
                  <span className={styles.itemText}>
                    <span className={styles.itemMainRow}>
                      <span className={styles.itemMain}>{h.name}</span>
                      <Stars n={h.stars} />
                    </span>
                    <span className={styles.itemSub}>{h.destinationName}{h.country ? `, ${h.country}` : ''}</span>
                  </span>
                  <span className={`${styles.tag} ${styles.tagHotel}`}>Hotel</span>
                </button>
              ))}
            </div>
          )}

          {results.destinations.length > 0 && (
            <div className={styles.section}>
              <div className={styles.group}><PinIcon /><span>Destinations</span></div>
              {results.destinations.map((d, i) => {
                const idx = nHotels + i;
                return (
                  <button
                    key={`d-${d.code}`} type="button"
                    className={`${styles.item} ${active === idx ? styles.itemActive : ''}`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => choose({ kind: 'destination', ...d })}
                  >
                    <span className={`${styles.itemIcon} ${styles.iconDest}`}><PinIcon /></span>
                    <span className={styles.itemText}>
                      <span className={styles.itemMain}>{d.name}</span>
                      <span className={styles.itemSub}>{d.country || 'Destination'}</span>
                    </span>
                    <span className={`${styles.tag} ${styles.tagDest}`}>Place</span>
                  </button>
                );
              })}
            </div>
          )}

          {onBrowseAll && (
            <button type="button" className={styles.browse} onClick={() => { setOpen(false); onBrowseAll(); }}>
              Browse all destinations
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
