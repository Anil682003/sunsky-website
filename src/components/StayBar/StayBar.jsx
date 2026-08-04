import { useState, useRef, useEffect } from 'react';
import styles from './StayBar.module.css';

// The "edit my search" bar on the hotel page: departure date, who's travelling, board,
// departure airport and length of stay.
//
// These were native <select>s, which is wrong for this job — a date is a calendar, occupancy
// is a pair of steppers, and "2 adults + 1 child" as a flat option list means enumerating every
// combination. This is the same field + popover pattern the homepage hero search uses: a labelled
// field showing the current value, one popover open at a time, closed by clicking away or Escape.
//
// It owns no search state. Every change is reported through `onChange` (a patch for the page's
// filter override) so the page stays the single source of truth.

const MIN_ADULTS = 1, MAX_ADULTS = 6;      // per room
const MIN_CHILDREN = 0, MAX_CHILDREN = 4;  // per room
const MAX_ROOMS = 5;
const CHILD_AGE_MAX = 17;
const DEFAULT_CHILD_AGE = 8;   // HotelBeds rejects a child with no age; matches the page's default
const NEARBY_SPAN = 12;   // how many "nearby departures" to list before the date input takes over

const Chevron = () => (
  <svg className={styles.chev} width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const Tick = () => (
  <svg className={styles.tick} width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

// one field: the closed control plus, when open, its popover
function Field({ id, icon, label, value, open, onToggle, children, wide }) {
  return (
    <div className={`${styles.field}${open ? ` ${styles.fieldOpen}` : ''}${wide ? ` ${styles.fieldWide}` : ''}`}>
      <button type="button" className={styles.trigger} onClick={() => onToggle(id)}
        aria-expanded={open} aria-haspopup="dialog">
        <span className={styles.ico}>{icon}</span>
        <span className={styles.body}>
          <span className={styles.label}>{label}</span>
          <span className={styles.value}>{value}</span>
        </span>
        <Chevron />
      </button>
      {open && <div className={styles.pop} role="dialog" aria-label={label}>{children}</div>}
    </div>
  );
}

function Stepper({ label, sub, value, min, max, onChange }) {
  return (
    <div className={styles.stepRow}>
      <span className={styles.stepText}>
        <span className={styles.stepLabel}>{label}</span>
        {sub && <span className={styles.stepSub}>{sub}</span>}
      </span>
      <span className={styles.stepper}>
        <button type="button" className={styles.stepBtn} onClick={() => onChange(value - 1)}
          disabled={value <= min} aria-label={`One fewer ${label.toLowerCase()}`}>−</button>
        <span className={styles.stepCount}>{value}</span>
        <button type="button" className={styles.stepBtn} onClick={() => onChange(value + 1)}
          disabled={value >= max} aria-label={`One more ${label.toLowerCase()}`}>+</button>
      </span>
    </div>
  );
}

// a plain list of choices with a tick on the current one — used for board, airport and nights
function OptionList({ options, current, onPick, scroll }) {
  return (
    <div className={`${styles.list}${scroll ? ` ${styles.listScroll}` : ''}`}>
      {options.map((o) => (
        <button type="button" key={o.id} className={`${styles.opt}${o.id === current ? ` ${styles.optOn}` : ''}`}
          onClick={() => onPick(o.id)} aria-pressed={o.id === current}>
          <span className={styles.optMain}>{o.label}</span>
          {o.note && <span className={styles.optNote}>{o.note}</span>}
          {o.id === current && <Tick />}
        </button>
      ))}
    </div>
  );
}

// Spread flat totals across N rooms, biggest rooms first — the page only stores totals plus a
// room count, so the per-room breakdown has to be reconstructed each time the popover opens.
function splitRooms(totalAdults, totalChildren, roomCount) {
  const n = Math.max(1, roomCount);
  return Array.from({ length: n }, (_, i) => ({
    adults: Math.floor(totalAdults / n) + (i < totalAdults % n ? 1 : 0),
    children: Math.floor(totalChildren / n) + (i < totalChildren % n ? 1 : 0),
  }));
}

export default function StayBar({
  checkIn, dateOptions = [], formatDate,
  adults, children: childCount, childAges = '', rooms: roomCount = 1,
  board = '', boardOptions = [],
  origin, originOptions = [], originLabel = (c) => c, destination = '',
  nights, nightOptions = [], durationChips = [],
  touched = false, onChange, onBoardChange, onChildAges, onReset,
}) {
  const [openField, setOpenField] = useState(null);
  const barRef = useRef(null);
  const toggle = (f) => setOpenField((p) => (p === f ? null : f));
  const close = () => setOpenField(null);

  // click away / Escape closes the open popover — same behaviour as the hero search
  useEffect(() => {
    if (!openField) return;
    const onDown = (e) => { if (barRef.current && !barRef.current.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [openField]);

  // Occupancy is edited as a DRAFT: a stepper click must not fire a fresh availability search on
  // every tap, so nothing is committed until "Save". Re-seeded from the committed values whenever
  // the popover opens, so dismissing it discards the draft.
  const [draft, setDraft] = useState(() => splitRooms(adults, childCount, roomCount));
  const [draftAges, setDraftAges] = useState(() => childAges);
  // Re-seed on every OPEN, not when the committed values change — otherwise a draft abandoned by
  // clicking away survives and reappears the next time the popover is opened.
  const paxOpen = openField === 'pax';
  const [wasPaxOpen, setWasPaxOpen] = useState(paxOpen);
  if (paxOpen !== wasPaxOpen) {
    setWasPaxOpen(paxOpen);
    if (paxOpen) { setDraft(splitRooms(adults, childCount, roomCount)); setDraftAges(childAges); }
  }

  const dAdults = draft.reduce((s, r) => s + r.adults, 0);
  const dChildren = draft.reduce((s, r) => s + r.children, 0);
  const dAges = (() => {
    const list = draftAges ? draftAges.split(',').map((a) => parseInt(a, 10) || 0) : [];
    return Array.from({ length: dChildren }, (_, i) => list[i] ?? DEFAULT_CHILD_AGE);
  })();
  const setRoom = (i, key, v) => setDraft((p) => p.map((r, k) => (k === i ? { ...r, [key]: v } : r)));
  const addRoom = () => setDraft((p) => (p.length >= MAX_ROOMS ? p : [...p, { adults: 2, children: 0 }]));
  const removeRoom = (i) => setDraft((p) => (p.length <= 1 ? p : p.filter((_, k) => k !== i)));
  const setDraftAge = (i, v) => setDraftAges(dAges.map((a, k) => (k === i ? v : a)).join(','));
  const saveOccupancy = () => {
    onChange({ adults: String(dAdults), children: String(dChildren), rooms: String(draft.length) });
    if (dChildren > 0) onChildAges?.(dAges.join(','));
    close();
  };
  const dirty = `${dAdults}|${dChildren}|${draft.length}|${dChildren ? dAges.join(',') : ''}`
    !== `${adults}|${childCount}|${roomCount}|${childCount ? childAges : ''}`;

  const today = new Date().toISOString().slice(0, 10);
  // The page can offer a year of departures; a 300-row scroller is no better than the old
  // <select>. Any date is reachable through the input above, so the list only shows a short
  // window around the current pick.
  const nearby = (() => {
    if (dateOptions.length <= NEARBY_SPAN) return dateOptions;
    const at = Math.max(0, dateOptions.findIndex((d) => d >= (checkIn || today)));
    const start = Math.min(Math.max(0, at - 3), Math.max(0, dateOptions.length - NEARBY_SPAN));
    return dateOptions.slice(start, start + NEARBY_SPAN);
  })();
  const paxLabel = `${adults} adult${adults === 1 ? '' : 's'}`
    + (childCount ? `, ${childCount} child${childCount === 1 ? '' : 'ren'}` : '')
    + (roomCount > 1 ? ` · ${roomCount} rooms` : '');
  const boardLabel = boardOptions.find((b) => b.id === board)?.label || 'No preference';
  const nightList = (nightOptions.includes(nights) ? nightOptions : [...nightOptions, nights].sort((a, b) => a - b));

  return (
    <div className={styles.bar} ref={barRef}>
      <div className={styles.fields}>
        <Field id="date" icon={ICONS.cal} label="Departure date" open={openField === 'date'} onToggle={toggle}
          value={checkIn ? formatDate(checkIn) : 'Pick a date'} wide>
          <label className={styles.dateWrap}>
            <span className={styles.popTitle}>Choose any date</span>
            <input type="date" className={styles.dateInput} value={checkIn || ''} min={today}
              onChange={(e) => { if (e.target.value) { onChange({ checkIn: e.target.value }); close(); } }} />
          </label>
          {nearby.length > 0 && (
            <>
              <div className={styles.popTitle}>Nearby departures</div>
              <OptionList scroll current={checkIn}
                options={nearby.map((d) => ({ id: d, label: formatDate(d) }))}
                onPick={(d) => { onChange({ checkIn: d }); close(); }} />
            </>
          )}
        </Field>

        <Field id="pax" icon={ICONS.users} label="Travelling company" value={paxLabel}
          open={openField === 'pax'} onToggle={toggle} wide>
          <div className={styles.roomScroll}>
            {draft.map((room, ri) => {
              // children are numbered across the whole party, so room 2's first child
              // continues room 1's count — that ordering is what the age list carries
              const before = draft.slice(0, ri).reduce((s, r) => s + r.children, 0);
              return (
                <div className={styles.roomCard} key={ri}>
                  <div className={styles.roomHead}>
                    <span className={styles.roomTitle}>
                      <span className={styles.roomBadge}>{ri + 1}</span> Room {ri + 1}
                    </span>
                    {ri > 0 && (
                      <button type="button" className={styles.roomRemove} onClick={() => removeRoom(ri)}>Remove</button>
                    )}
                  </div>
                  <Stepper label="Adults" sub="from 18 years" value={room.adults}
                    min={MIN_ADULTS} max={MAX_ADULTS} onChange={(v) => setRoom(ri, 'adults', v)} />
                  <Stepper label="Children" sub="0 to 17 years" value={room.children}
                    min={MIN_CHILDREN} max={MAX_CHILDREN} onChange={(v) => setRoom(ri, 'children', v)} />
                  {room.children > 0 && onChildAges && (
                    <div className={styles.ages}>
                      <div className={styles.popTitle}>Age at check-in</div>
                      {Array.from({ length: room.children }, (_, ci) => {
                        const idx = before + ci;
                        return (
                          <div className={styles.ageRow} key={ci}>
                            <span className={styles.ageLabel}>Child {ci + 1}</span>
                            <select className={styles.ageSelect} value={dAges[idx] ?? DEFAULT_CHILD_AGE}
                              onChange={(e) => setDraftAge(idx, Number(e.target.value))}
                              aria-label={`Age of child ${ci + 1} in room ${ri + 1}`}>
                              {Array.from({ length: CHILD_AGE_MAX + 1 }, (_, a) => (
                                <option key={a} value={a}>{a === 0 ? 'Under 1' : `${a} year${a === 1 ? '' : 's'}`}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                      <p className={styles.ageHint}>Hotels price children by age, so this changes the rate.</p>
                    </div>
                  )}
                </div>
              );
            })}
            {draft.length < MAX_ROOMS && (
              <button type="button" className={styles.addRoom} onClick={addRoom}>
                <span className={styles.addRoomIcon}>+</span> Add extra room
              </button>
            )}
          </div>
          <div className={styles.popFoot}>
            <span className={styles.popSummary}>
              {dAdults} adult{dAdults === 1 ? '' : 's'}
              {dChildren ? `, ${dChildren} child${dChildren === 1 ? '' : 'ren'}` : ''}
              {' · '}{draft.length} room{draft.length === 1 ? '' : 's'}
            </span>
            <button type="button" className={styles.saveBtn} onClick={saveOccupancy} disabled={!dirty}>Save</button>
          </div>
        </Field>

        <Field id="board" icon={ICONS.board} label="Care (meals)" value={boardLabel}
          open={openField === 'board'} onToggle={toggle}>
          <OptionList current={board} options={boardOptions}
            onPick={(id) => { onBoardChange?.(id); close(); }} />
        </Field>

        <Field id="origin" icon={ICONS.plane} label="Transport" open={openField === 'origin'} onToggle={toggle}
          value={`${originLabel(origin)} (${origin})${destination ? ` → ${destination}` : ''}`} wide>
          <div className={styles.popTitle}>Flying from</div>
          <OptionList scroll current={origin}
            options={originOptions.map((o) => ({
              id: o, label: `${originLabel(o)} (${o})`, note: destination ? `→ ${destination}` : null,
            }))}
            onPick={(o) => { onChange({ origin: o }); close(); }} />
        </Field>

        <Field id="nights" icon={ICONS.moon} label="Duration" value={`${nights} night${nights === 1 ? '' : 's'}`}
          open={openField === 'nights'} onToggle={toggle}>
          <OptionList scroll current={nights}
            options={nightList.map((n) => ({
              id: n, label: `${n} night${n === 1 ? '' : 's'}`, note: `${n + 1} days`,
            }))}
            onPick={(n) => { onChange({ nights: Number(n) }); close(); }} />
        </Field>
      </div>

      <div className={styles.foot}>
        <span className={styles.footLabel}>Exact duration</span>
        <div className={styles.chips}>
          {durationChips.map((n) => (
            <button type="button" key={n} className={`${styles.chip}${nights === n ? ` ${styles.chipOn}` : ''}`}
              onClick={() => onChange({ nights: n })} aria-pressed={nights === n}>{n + 1} days</button>
          ))}
        </div>
        {touched && <button type="button" className={styles.reset} onClick={onReset}>Reset to my search</button>}
      </div>
    </div>
  );
}

const ICONS = {
  cal: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 11h18" /></svg>
  ),
  users: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.4" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 11.5a3 3 0 1 0 0-6M18 20a5.5 5.5 0 0 0-2-4.3" /></svg>
  ),
  board: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h12v5a6 6 0 0 1-12 0V8zM16 9h2.5a2.5 2.5 0 0 1 0 5H16M3 21h14" /></svg>
  ),
  plane: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round"><path d="M2 14l20-8-8 20-2.5-8.5L2 14z" /></svg>
  ),
  moon: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 10 4a6.7 6.7 0 0 0 10 10.5z" /></svg>
  ),
};
