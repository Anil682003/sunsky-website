import { useState, useEffect, useRef } from 'react';
import styles from './AirportSearch.module.css';
import { searchAirports } from '../../api';

/**
 * Type-to-search over the airports held in the dashboard (Products → Geo → Airports).
 *
 * The flight search used to offer two hardcoded arrays of eight: eight airports you could
 * leave from and eight you could fly to. Anything else — Malaga, Dubai, Lisbon, the other
 * 1,290 rows the dashboard already holds — simply could not be picked, and the lists went
 * stale the moment the team added an airport.
 *
 * Shape of an option, from /website/geo/airports:
 *   { code:'BRU', name:'Brussel Nationale Airport', city:'Brussel', country:'Belgium', flag:'🇧🇪' }
 * `fallback` takes the same shape, so the curated shortlist and the live results render
 * through one row component.
 */

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

/** Two lines per row: the place with its code, then the airport and country beneath. */
const primary = (a) => `${a.city || a.name || a.code} (${a.code})`;
const secondary = (a) => [a.city && a.name && a.name !== a.city ? a.name : '', a.country]
  .filter(Boolean).join(' · ');

export default function AirportSearch({
  title,
  placeholder = 'City or airport name',
  fallback = [],
  fallbackLabel = 'Popular',
  onPick,
  onClose,
}) {
  const [term, setTerm] = useState('');
  // Results carry the term they answer. A response is shown only while it still matches what
  // is typed, so a slow answer to "bru" can never be listed under "brussels" — and there is
  // nothing to clear when the traveller deletes back to one character.
  const [hits, setHits] = useState({ term: '', list: [] });
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);

  // preventScroll, or the browser scrolls the page to bring the freshly focused input into
  // view — the panel opens and the whole page lurches under the pointer.
  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);

  const q = term.trim();
  const searching = q.length >= MIN_QUERY;
  const answered = hits.term === q;
  const busy = searching && !answered;
  const showing = searching ? (answered ? hits.list : []) : fallback;
  const active = Math.min(cursor, Math.max(0, showing.length - 1));

  // Debounced fetch. The AbortController drops a superseded keystroke's request rather than
  // merely ignoring its answer.
  useEffect(() => {
    const query = term.trim();
    if (query.length < MIN_QUERY) return undefined;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const list = await searchAirports(query, 8, { signal: ctrl.signal });
      if (!ctrl.signal.aborted) setHits({ term: query, list });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [term]);

  const pick = (a) => { onPick?.(a); onClose?.(); };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
    if (!showing.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((i) => (i + 1) % showing.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((i) => (i - 1 + showing.length) % showing.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(showing[active]); }
  };

  return (
    <div className={styles.wrap} onClick={(e) => e.stopPropagation()}>
      <div className={styles.searchRow}>
        <span className={styles.searchIcon}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
        </span>
        <input
          ref={inputRef}
          className={styles.input}
          value={term}
          placeholder={placeholder}
          onChange={(e) => { setTerm(e.target.value); setCursor(0); }}
          onKeyDown={onKeyDown}
          aria-label={title}
        />
        {term && (
          <button type="button" className={styles.clear} onClick={() => { setTerm(''); setCursor(0); }} aria-label="Clear">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      <div className={styles.groupLabel}>
        {searching
          ? (busy ? 'Searching…' : `${showing.length} airport${showing.length === 1 ? '' : 's'}`)
          : fallbackLabel}
      </div>

      {/* Only ever one of these: the rows, or a line saying why there are none. Both sit in a
          box with a floor under it, so the panel keeps its size as you type instead of
          snapping shorter on every keystroke that narrows the list. */}
      <div className={styles.results}>
      {showing.length > 0 ? (
        <div className={styles.list} role="listbox">
          {showing.map((a, i) => (
            <button
              type="button"
              key={`${a.code}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`${styles.row} ${i === active ? styles.rowOn : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => pick(a)}
            >
              <span className={styles.flag}>{a.flag || '✈'}</span>
              <span className={styles.text}>
                <span className={styles.primary}>{primary(a)}</span>
                {secondary(a) && <span className={styles.secondary}>{secondary(a)}</span>}
              </span>
              <span className={styles.code}>{a.code}</span>
            </button>
          ))}
        </div>
      ) : (
        !busy && (
          <div className={styles.empty}>
            {searching
              ? <>No airport matches “{q}”. Try the city name, or its three-letter code.</>
              : 'Start typing a city or airport name.'}
          </div>
        )
      )}
      </div>
    </div>
  );
}
