import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { searchDestinationsAndHotels } from '../../api/filters';
import styles from './DestinationSearch.module.css';

// The header search, styled as a slim die-cut travel ticket: a warm magnifier "stub" separated
// from the input by a perforation, a manifest-style dropdown (hotels first, then destinations),
// and — before anything is typed — recent searches plus CMS-fed popular destinations.
//
// onSelect({type:'hotel'|'destination', ...}) fires for search results and recents; suggestion
// chips carry a prebuilt URL instead (countries vs destinations params differ), so they go
// through onGo(url). Both are provided by the Navbar.

const SearchIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7.5" /><path d="M21 21l-4.3-4.3" />
  </svg>
);
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
const ClockIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
);
const SunIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

// A hotel's rating marks — stars for hotels, keys for apartments. Hotelbeds rates apartments in
// keys (llaves), not stars. Accepts the backend's `rating: { kind, value }`; falls back to a
// bare star count `n` for older callers.
const Stars = ({ rating, n }) => {
  const kind = rating?.kind === 'key' ? 'key' : 'star';
  const count = Math.max(0, Math.min(5, Math.round((rating?.value ?? n) || 0)));
  if (!count) return null;
  const KEY = 'M7 14a5 5 0 1 1 4.9-6h8.1a1 1 0 0 1 .7.3l1.6 1.6a1 1 0 0 1 0 1.4l-2.3 2.3a1 1 0 0 1-1.4 0l-.8-.8-1 1-.9-.9-1 1-1.3-1.3H11.9A5 5 0 0 1 7 14Zm-1.6-3.4a1.4 1.4 0 1 0 0-2 1.4 1.4 0 0 0 0 2Z';
  const STAR = 'M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.6 5.9 20.4l1.4-6.8L2.2 9l6.9-.7z';
  return (
    <span className={styles.stars} aria-label={`${count} ${kind}`}>
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} width={kind === 'key' ? 12 : 11} height={kind === 'key' ? 12 : 11} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d={kind === 'key' ? KEY : STAR} />
        </svg>
      ))}
    </span>
  );
};

// A row's leading square: the hotel's MASTER image when it has one, else the icon. Shared by
// the results manifest and the recents list so a hotel looks the same wherever it appears.
// About 8% of hotels carry no photo, and any CDN URL can 404 — both land on the icon.
const RowThumb = ({ image, broken, onBroken, fallbackClass, children }) => {
  if (!image || broken) {
    return <span className={`${styles.itemIcon} ${fallbackClass}`}>{children}</span>;
  }
  return (
    <span className={`${styles.itemIcon} ${styles.itemThumb}`}>
      <img src={image} alt="" loading="lazy" decoding="async" aria-hidden="true" onError={onBroken} />
    </span>
  );
};

// A destination row's leading square: the country flag from geo data — the flagcdn SVG when we
// have a clean ISO code, else the emoji, else the pin icon. `contain` (not cover) so the 3:2 flag
// isn't cropped. Self-contained broken-state so a 404 flag falls back to the pin.
const FlagTile = ({ flag, flagUrl }) => {
  const [broken, setBroken] = useState(false);
  if (flagUrl && !broken) {
    return (
      <span className={`${styles.itemIcon} ${styles.itemFlag}`}>
        <img src={flagUrl} alt="" loading="lazy" decoding="async" aria-hidden="true" onError={() => setBroken(true)} />
      </span>
    );
  }
  if (flag) return <span className={`${styles.itemIcon} ${styles.iconDest} ${styles.flagEmoji}`}>{flag}</span>;
  return <span className={`${styles.itemIcon} ${styles.iconDest}`}><PinIcon /></span>;
};

// ── Recent searches (localStorage) ──────────────────────────────────────────
const RECENTS_KEY = 'sunsky.recentSearches';
const RECENTS_MAX = 4;

// A stored entry is only usable if it still carries the identity the caller navigates by:
// a hotel needs its hotelCode, a destination its code. Without this guard a half-written or
// older-format entry sails through to `/results?hotelCode=undefined`, which prices nothing.
const isUsableRecent = (r) =>
  !!r && typeof r.name === 'string' && r.name.trim() !== '' &&
  ((r.kind === 'hotel' && r.hotelCode != null && String(r.hotelCode) !== '') ||
   (r.kind === 'destination' && !!r.code));

const loadRecents = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY));
    return Array.isArray(raw) ? raw.filter(isUsableRecent).slice(0, RECENTS_MAX) : [];
  } catch { return []; }   // unparseable, or storage blocked (Safari private mode)
};
const saveRecent = (item) => {
  // De-dupe on kind+identity, not name: a hotel and a city can share a name ("Antalya"), and
  // the same hotel renamed upstream must still replace its own entry rather than pile up.
  const sameAs = (r) => r.kind === item.kind &&
    (item.kind === 'hotel' ? String(r.hotelCode) === String(item.hotelCode) : r.code === item.code);
  const next = [item, ...loadRecents().filter((r) => !sameAs(r))].slice(0, RECENTS_MAX);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch { /* storage full or blocked — the list still updates for this session */ }
  return next;
};

// ── Typewriter hook — cycles destination names in the resting pill ──────────
// Types each name char-by-char, holds, deletes, moves on. Returns null (meaning
// "use a static placeholder") when reduced motion is preferred or no names exist.
const useTypewriter = (names, active) => {
  const [text, setText] = useState('');
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );
  useEffect(() => {
    if (reduced || !active || !names.length) return undefined;
    let i = 0, pos = 0, dir = 1, cancelled = false, t;
    const tick = () => {
      if (cancelled) return;
      const name = names[i % names.length];
      pos += dir;
      setText(name.slice(0, pos));
      let delay = dir > 0 ? 70 : 38;
      if (dir > 0 && pos >= name.length) { dir = -1; delay = 2100; }
      else if (dir < 0 && pos <= 0) { dir = 1; i += 1; delay = 320; }
      t = setTimeout(tick, delay);
    };
    t = setTimeout(tick, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [names, active, reduced]);
  if (reduced || !names.length) return null;
  return text;
};

export default function DestinationSearch({ onSelect, onGo, onBrowseAll, suggestions = [], placeholder = 'Search hotels & destinations' }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState({ destinations: [], hotels: [] });
  const [open, setOpen]       = useState(false);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive]   = useState(-1);
  const [recents, setRecents] = useState(loadRecents);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const reqRef = useRef(0);
  // Hotels whose thumbnail failed to load — keyed by hotelCode, so that row falls back to the
  // icon instead of showing a broken frame, and stays fallen back across re-renders.
  const [brokenImg, setBrokenImg] = useState({});
  const markBroken = useCallback((code) => {
    setBrokenImg((m) => (m[code] ? m : { ...m, [code]: true }));
  }, []);

  // Debounced search — only the latest request's result is applied (reqRef guards races).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults({ destinations: [], hotels: [] }); setLoading(false); return; }
    setLoading(true);
    const id = ++reqRef.current;
    const t = setTimeout(async () => {
      const r = await searchDestinationsAndHotels(q);
      if (id === reqRef.current) {
        // Some source names carry stray whitespace; trim so the field, the label and the results
        // banner never render a doubled space.
        setResults({
          hotels: (r.hotels || []).map((h) => ({ ...h, name: (h.name || '').trim() })),
          destinations: (r.destinations || []).map((d) => ({ ...d, name: (d.name || '').trim() })),
        });
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // The resting pill types real destination names (the same ones the suggestion
  // chips offer). Paused the moment the field is focused or holds text.
  const typeNames = useMemo(() => suggestions.map((s) => s.label).filter(Boolean).slice(0, 6), [suggestions]);
  const typed = useTypewriter(typeNames, !focused && query === '');
  const showTyped = typed !== null && !focused && query === '';

  // Flat list in render order (DESTINATIONS then hotels) so keyboard nav maps to what's shown.
  const flat = [
    ...results.destinations.map((d) => ({ kind: 'destination', ...d })),
    ...results.hotels.map((h) => ({ kind: 'hotel', ...h })),
  ];

  const choose = (item) => {
    setQuery(item.name);
    setOpen(false);
    setActive(-1);
    setRecents(saveRecent(item));
    if (item.kind === 'hotel') {
      // `image` rides along so a hotel picked today still shows its photo when it comes back
      // as a recent search tomorrow — recents are stored from exactly this object.
      onSelect({ type: 'hotel', hotelCode: item.hotelCode, name: item.name, destinationCode: item.destinationCode, destinationName: item.destinationName, country: item.country, stars: item.stars, image: item.image ?? null });
    } else {
      onSelect({ type: 'destination', code: item.code, name: item.name, country: item.country });
    }
  };

  const clear = () => { setQuery(''); setResults({ destinations: [], hotels: [] }); setActive(-1); onSelect(null); inputRef.current?.focus(); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && active >= 0 && flat[active]) { e.preventDefault(); choose(flat[active]); }
    // Reset the highlight too, or reopening the box resumes on a row from the previous query.
    else if (e.key === 'Escape') { setOpen(false); setActive(-1); }
  };

  const hasQuery = query.trim().length >= 2;
  const showResults = open && hasQuery;
  // Before typing: recents (returning visitors) + popular chips (everyone).
  const showIdle = open && !hasQuery && (recents.length > 0 || suggestions.length > 0);
  const nHotels = results.hotels.length;
  const nDests = results.destinations.length;

  return (
    <div className={styles.wrap} ref={boxRef}>
      {/* The magnifier stub — the tear-off end of the ticket. */}
      <span className={styles.stub} aria-hidden="true"><SearchIcon /></span>
      <span className={styles.perf} aria-hidden="true" />
      <span className={styles.notchTop} aria-hidden="true" />
      <span className={styles.notchBottom} aria-hidden="true" />
      {/* Runway lights under the ticket — ignite while it is focused. State-carrying,
          not ambient: dark until the field is engaged. */}
      <span className={styles.runway} aria-hidden="true" />

      <div className={styles.inputZone}>
        <input
          ref={inputRef}
          className={styles.input}
          value={query}
          placeholder={showTyped ? '' : placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => { setFocused(true); setOpen(true); }}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          aria-label="Search hotels and destinations"
          autoComplete="off"
        />
        {/* The self-typing invitation — hidden the instant the real caret takes over. */}
        {showTyped && (
          <span className={styles.typeHint} aria-hidden="true">
            <span className={styles.typeLead}>Search&nbsp;</span>
            <span className={styles.typeName}>“{typed}”</span>
            <span className={styles.caret} />
          </span>
        )}
      </div>
      {query && <button type="button" className={styles.clear} onClick={clear} aria-label="Clear">×</button>}

      {/* ── Idle panel: recents + popular, before anything is typed ── */}
      {showIdle && (
        <div className={styles.dropdown}>
          {recents.length > 0 && (
            <div className={styles.section}>
              <div className={styles.group}><ClockIcon /><span>Recent searches</span></div>
              {recents.map((r, i) => (
                <button
                  key={`r-${r.name}-${i}`} type="button" className={styles.item}
                  onClick={() => choose(r)}
                >
                  {r.kind === 'destination'
                    ? <FlagTile flag={r.flag} flagUrl={r.flagUrl} />
                    : (
                      <RowThumb
                        image={r.image}
                        broken={brokenImg[r.hotelCode]}
                        onBroken={() => markBroken(r.hotelCode)}
                        fallbackClass={styles.iconRecent}
                      >
                        <HotelIcon />
                      </RowThumb>
                    )}
                  <span className={styles.itemText}>
                    <span className={styles.itemMain}>{r.name}</span>
                    <span className={styles.itemSub}>{r.kind === 'hotel' ? [r.destinationName, r.country].filter(Boolean).join(', ') : (r.country || 'Destination')}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {suggestions.length > 0 && (
            <div className={styles.section}>
              <div className={styles.group}><SunIcon /><span>Popular right now</span></div>
              <div className={styles.chipRow}>
                {suggestions.map((s, i) => (
                  <button
                    key={`s-${s.label}`} type="button" className={styles.chip}
                    style={{ animationDelay: `${i * 30}ms` }}
                    onClick={() => { setOpen(false); onGo?.(s.url); }}
                  >
                    <PinIcon />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Results manifest ── */}
      {showResults && (
        <div className={styles.dropdown}>
          {flat.length > 0 && (
            <div className={styles.tallyStrip}>
              <span className={styles.tally}>
                {nDests > 0 && `${nDests} place${nDests === 1 ? '' : 's'}`}
                {nDests > 0 && nHotels > 0 && ' · '}
                {nHotels > 0 && `${nHotels} hotel${nHotels === 1 ? '' : 's'}`}
              </span>
            </div>
          )}
          {loading && flat.length === 0 && (
            <div className={styles.state}><span className={styles.spinner} />Searching…</div>
          )}
          {!loading && flat.length === 0 && (
            <div className={styles.state}>No hotels or destinations match “{query.trim()}”.</div>
          )}

          {results.destinations.length > 0 && (
            <div className={styles.section}>
              <div className={styles.group}><PinIcon /><span>Destinations</span></div>
              {results.destinations.map((d, i) => (
                <button
                  key={`d-${d.code}`} type="button"
                  className={`${styles.item} ${styles.itemRise} ${active === i ? styles.itemActive : ''}`}
                  style={{ animationDelay: `${Math.min(i, 5) * 20}ms` }}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose({ kind: 'destination', ...d })}
                >
                  <FlagTile flag={d.flag} flagUrl={d.flagUrl} />
                  <span className={styles.itemText}>
                    <span className={styles.itemMain}>{d.name}</span>
                    <span className={styles.itemSub}>{d.country || 'Destination'}</span>
                  </span>
                  <span className={`${styles.tag} ${styles.tagDest}`}>Place</span>
                </button>
              ))}
            </div>
          )}

          {results.hotels.length > 0 && (
            <div className={styles.section}>
              <div className={styles.group}><HotelIcon /><span>Hotels</span></div>
              {results.hotels.map((h, i) => {
                const idx = nDests + i;
                return (
                  <button
                    key={`h-${h.hotelCode}`} type="button"
                    className={`${styles.item} ${styles.itemRise} ${active === idx ? styles.itemActive : ''}`}
                    style={{ animationDelay: `${Math.min(idx, 7) * 20}ms` }}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => choose({ kind: 'hotel', ...h })}
                  >
                    <RowThumb
                      image={h.image}
                      broken={brokenImg[h.hotelCode]}
                      onBroken={() => markBroken(h.hotelCode)}
                      fallbackClass={styles.iconHotel}
                    >
                      <HotelIcon />
                    </RowThumb>
                    <span className={styles.itemText}>
                      <span className={styles.itemMainRow}>
                        <span className={styles.itemMain}>{h.name}</span>
                        <Stars rating={h.rating} n={h.stars} />
                      </span>
                      <span className={styles.itemSub}>{h.destinationName}{h.country ? `, ${h.country}` : ''}</span>
                    </span>
                    <span className={`${styles.tag} ${styles.tagHotel}`}>Hotel</span>
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
