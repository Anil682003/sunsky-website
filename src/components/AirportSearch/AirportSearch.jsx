import { useState, useEffect, useRef } from 'react';
import styles from './AirportSearch.module.css';
import { searchAirports } from '../../api';
import { flagUrl } from '../../utils/countryFlag';
import { isoFromFlagEmoji } from '../../utils/airports';

/**
 * The From/To panel of the flight search — type-to-search over the dashboard's whole airport
 * table (Products → Geo → Airports), with a curated list showing until the traveller types.
 *
 * Three modes, because the panel does three jobs on this site:
 *   • `query` given (CONTROLLED) — the field the panel hangs off IS the text box, so the panel
 *     renders no input of its own and reads the term it is handed. This is the Flights-only
 *     tab: the traveller types into the From/To field and picks a row underneath it. Hand it
 *     a `navRef` and that outside input drives the list with the arrow keys and Enter.
 *   • uncontrolled + `searchable` — the panel carries its own search row.
 *   • `searchable={false}` — a plain list, for a panel whose options really are a shortlist.
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
  query,
  navRef,
  onPick,
  onClose,
}) {
  const [innerTerm, setInnerTerm] = useState('');
  // A string `query` hands the typing to whoever rendered this panel; anything else (the
  // default `undefined`) leaves the panel owning its own term, exactly as before.
  const controlled = typeof query === 'string';
  const term = controlled ? query : innerTerm;
  const setTerm = controlled ? () => {} : setInnerTerm;
  // Results carry the term they answer. A response is shown only while it still matches what
  // is typed, so a slow answer to "bru" can never be listed under "brussels" — and there is
  // nothing to clear when the traveller deletes back to one character.
  const [hits, setHits] = useState({ term: '', list: [] });
  // The highlighted row is remembered WITH the term it belongs to, rather than being reset by
  // an effect when the term changes: the row that sat under the cursor for "bru" is a
  // different airport once "brus" has answered, so a cursor from another term is simply not
  // this term's cursor and the top row is.
  const [cursorAt, setCursorAt] = useState({ term: '', i: 0 });
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  // preventScroll, or the browser scrolls the page to bring the freshly focused input into
  // view — the panel opens and the whole page lurches under the pointer. With no field to
  // focus, the panel itself takes the focus so the arrow keys and Escape still work.
  useEffect(() => {
    if (controlled) return;   // the field outside already holds the caret — don't take it back
    (inputRef.current || wrapRef.current)?.focus({ preventScroll: true });
  }, [controlled]);

  const cursor = cursorAt.term === term ? cursorAt.i : 0;
  const setCursor = (next) =>
    setCursorAt({ term, i: typeof next === 'function' ? next(cursor) : next });

  const q = term.trim();
  // Controlled panels are ALWAYS typeable — the box they read from is the field above them.
  const typeable = searchable || controlled;
  const searching = typeable && q.length >= MIN_QUERY;
  const answered = hits.term === q;
  const busy = searching && !answered;
  const showing = searching ? (answered ? hits.list : []) : fallback;
  const active = Math.min(cursor, Math.max(0, showing.length - 1));

  // Debounced fetch. The AbortController drops a superseded keystroke's request rather than
  // merely ignoring its answer.
  useEffect(() => {
    const needle = term.trim();
    if (!typeable || needle.length < MIN_QUERY) return undefined;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const list = await searchAirports(needle, 12, { signal: ctrl.signal });
      if (!ctrl.signal.aborted) setHits({ term: needle, list });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [term, typeable]);

  const pick = (a) => { onPick?.(a); onClose?.(); };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
    if (e.key === 'Tab') { onClose?.(); return; }   // tabbing on means leaving this field
    if (!showing.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((i) => (i + 1) % showing.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((i) => (i - 1 + showing.length) % showing.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(showing[active]); }
  };

  // The outside field's input drives this list through a ref rather than through a prop, so a
  // keystroke doesn't re-render the panel merely to hand it a new callback. Published after
  // each render (a ref may not be written during one) and taken back down on unmount, so a
  // closed panel cannot keep answering the field's arrow keys.
  useEffect(() => {
    if (!navRef) return undefined;
    navRef.current = onKeyDown;
    return () => { navRef.current = null; };
  });

  // Only a panel with neither its own input nor an outside one has to catch keys itself.
  const selfDriven = !controlled && !searchable;

  return (
    <div
      className={styles.wrap}
      ref={wrapRef}
      tabIndex={selfDriven ? -1 : undefined}
      onKeyDown={selfDriven ? onKeyDown : undefined}
      onClick={(e) => e.stopPropagation()}
      aria-label={selfDriven ? title : undefined}
    >
      {searchable && !controlled && (
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

      <div className={`${styles.groupLabel} ${searchable && !controlled ? '' : styles.groupLabelTop}`}>
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
              : typeable ? 'Start typing a city or airport name.' : 'No airports to choose from yet.'}
          </div>
        )
      )}
      </div>
    </div>
  );
}
