import { useState, useEffect, useRef } from 'react';
import styles from './AirportSearch.module.css';
import { searchAirports } from '../../api';
import { flagUrl } from '../../utils/countryFlag';
import { isoFromFlagEmoji } from '../../utils/airports';

/**
 * The From/To panel of the flight search — a LIST of airports to pick from, which can also
 * type-to-search the dashboard's whole airport table (Products → Geo → Airports).
 *
 * `searchable={false}` is the plain-list mode the agency asked for: the traveller picks from
 * the options handed in and nothing else, with no field to type into. Searchable mode still
 * exists for a panel whose choice is genuinely open-ended — the dashboard holds 1,300
 * airports, and only a search can reach the ones no shortlist names.
 *
 * Shape of an option, from /website/geo/airports:
 *   { code:'BRU', name:'Brussel Nationale Airport', city:'Brussel', country:'Belgium',
 *     flag:'🇧🇪', isoCode:'BE' }
 * `fallback` takes the same shape, so the curated list and the live results render through
 * one row component.
 */

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

/** Two lines per row: the place with its code, then the airport and country beneath. */
const primary = (a) => `${a.city || a.name || a.code} (${a.code})`;
const secondary = (a) => [a.city && a.name && a.name !== a.city ? a.name : '', a.country]
  .filter(Boolean).join(' · ');

// The country flag as a real image — Windows has no flag glyphs and prints the emoji as the
// bare letters "BE". The ISO code comes with the row, or out of the emoji it was built from;
// the emoji (or a plane) stays as the fallback.
const Flag = ({ airport }) => {
  const url = flagUrl(airport.isoCode || isoFromFlagEmoji(airport.flag));
  return url
    ? <img className={styles.flagImg} src={url} alt="" decoding="async" aria-hidden="true" />
    : <span className={styles.flag}>{airport.flag || '✈'}</span>;
};

export default function AirportSearch({
  title,
  placeholder = 'City or airport name',
  fallback = [],
  fallbackLabel = 'Popular',
  searchable = true,
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
  const wrapRef = useRef(null);

  // preventScroll, or the browser scrolls the page to bring the freshly focused input into
  // view — the panel opens and the whole page lurches under the pointer. With no field to
  // focus, the panel itself takes the focus so the arrow keys and Escape still work.
  useEffect(() => {
    (inputRef.current || wrapRef.current)?.focus({ preventScroll: true });
  }, []);

  const q = term.trim();
  const searching = searchable && q.length >= MIN_QUERY;
  const answered = hits.term === q;
  const busy = searching && !answered;
  const showing = searching ? (answered ? hits.list : []) : fallback;
  const active = Math.min(cursor, Math.max(0, showing.length - 1));

  // Debounced fetch. The AbortController drops a superseded keystroke's request rather than
  // merely ignoring its answer.
  useEffect(() => {
    const query = term.trim();
    if (!searchable || query.length < MIN_QUERY) return undefined;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const list = await searchAirports(query, 8, { signal: ctrl.signal });
      if (!ctrl.signal.aborted) setHits({ term: query, list });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [term, searchable]);

  const pick = (a) => { onPick?.(a); onClose?.(); };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
    if (!showing.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((i) => (i + 1) % showing.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((i) => (i - 1 + showing.length) % showing.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(showing[active]); }
  };

  return (
    <div
      className={styles.wrap}
      ref={wrapRef}
      tabIndex={searchable ? undefined : -1}
      onKeyDown={searchable ? undefined : onKeyDown}
      onClick={(e) => e.stopPropagation()}
      aria-label={searchable ? undefined : title}
    >
      {searchable && (
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
      )}

      <div className={`${styles.groupLabel} ${searchable ? '' : styles.groupLabelTop}`}>
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
              <Flag airport={a} />
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
              : searchable ? 'Start typing a city or airport name.' : 'No airports to choose from yet.'}
          </div>
        )
      )}
      </div>
    </div>
  );
}
