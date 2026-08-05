import { useState, useRef, useEffect } from 'react';
import styles from './StayBar.module.css';
import { DURATION_BANDS, bandByLabel, bandForNights, lengthsInBand } from '../../utils/durations';

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
const DEFAULT_CHILD_AGE = 8;   // HotelBeds rejects a child with no age; matches the page's default

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
// Each room carries a `dobs` array (one empty string per child) for the DOB pickers.
function splitRooms(totalAdults, totalChildren, roomCount) {
  const n = Math.max(1, roomCount);
  return Array.from({ length: n }, (_, i) => {
    const ch = Math.floor(totalChildren / n) + (i < totalChildren % n ? 1 : 0);
    return { adults: Math.floor(totalAdults / n) + (i < totalAdults % n ? 1 : 0), children: ch, dobs: Array(ch).fill('') };
  });
}

export default function StayBar({
  checkIn, formatDate,
  adults, children: childCount, childAges = '', rooms: roomCount = 1,
  board = '', boardOptions = [], boardHint = '',
  origin, originOptions = [], originLabel = (c) => c, destination = '',
  transport = 'package',
  nights,
  touched = false, onChange, onBoardChange, onChildAges, onReset,
}) {
  const [openField, setOpenField] = useState(null);
  const barRef = useRef(null);
  const dateRef = useRef(null);
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
  // Re-seed on every OPEN, not when the committed values change — otherwise a draft abandoned by
  // clicking away survives and reappears the next time the popover is opened.
  const paxOpen = openField === 'pax';
  const [wasPaxOpen, setWasPaxOpen] = useState(paxOpen);
  if (paxOpen !== wasPaxOpen) {
    setWasPaxOpen(paxOpen);
    if (paxOpen) setDraft(splitRooms(adults, childCount, roomCount));
  }

  const dAdults = draft.reduce((s, r) => s + r.adults, 0);
  const dChildren = draft.reduce((s, r) => s + r.children, 0);

  const setRoom = (i, key, v) => setDraft((p) => p.map((r, k) => {
    if (k !== i) return r;
    if (key === 'children') {
      const n = Math.max(0, Math.min(MAX_CHILDREN, v));
      const dobs = r.dobs.slice(0, n);
      while (dobs.length < n) dobs.push('');
      return { ...r, children: n, dobs };
    }
    return { ...r, [key]: v };
  }));
  const updateChildDob = (roomIdx, childIdx, val) =>
    setDraft((p) => p.map((r, i) =>
      i === roomIdx ? { ...r, dobs: r.dobs.map((d, j) => (j === childIdx ? val : d)) } : r
    ));
  const addRoom = () => setDraft((p) => (p.length >= MAX_ROOMS ? p : [...p, { adults: 2, children: 0, dobs: [] }]));
  const removeRoom = (i) => setDraft((p) => (p.length <= 1 ? p : p.filter((_, k) => k !== i)));

  const ageFromDob = (dob) => {
    if (!dob) return null;
    const b = new Date(dob + 'T00:00:00');
    if (isNaN(b.getTime())) return null;
    const ref = checkIn ? new Date(checkIn + 'T00:00:00') : new Date();
    let a = ref.getFullYear() - b.getFullYear();
    const m = ref.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) a -= 1;
    return a >= 0 ? a : 0;
  };

  const saveOccupancy = () => {
    onChange({ adults: String(dAdults), children: String(dChildren), rooms: String(draft.length) });
    if (dChildren > 0) {
      const ages = draft.flatMap((r) => r.dobs).map((dob) => {
        const a = ageFromDob(dob);
        return a != null ? a : DEFAULT_CHILD_AGE;
      });
      onChildAges?.(ages.join(','));
    }
    close();
  };

  const draftAgesStr = draft.flatMap((r) => r.dobs).map((dob) => {
    const a = ageFromDob(dob);
    return a != null ? a : DEFAULT_CHILD_AGE;
  }).join(',');
  const dirty = `${dAdults}|${dChildren}|${draft.length}|${dChildren ? draftAgesStr : ''}`
    !== `${adults}|${childCount}|${roomCount}|${childCount ? childAges : ''}`;

  // LOCAL date parts, not toISOString(). This is the `min` on the departure picker and the `max`
  // on the children's dates of birth, and UTC is the wrong day for part of every night: at 00:30
  // in Brussels toISOString() still reports yesterday, which would have let a traveller pick a
  // departure date that had already passed.
  const today = (() => {
    const d = new Date();
    const p = (v) => String(v).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  })();
  const paxLabel = `${adults} adult${adults === 1 ? '' : 's'}`
    + (childCount ? `, ${childCount} child${childCount === 1 ? '' : 'ren'}` : '')
    + (roomCount > 1 ? ` · ${roomCount} rooms` : '');
  const boardLabel = boardOptions.find((b) => b.id === board)?.label || 'No preference';
  // Duration speaks in the home page's day-bands. The field names the band the current stay
  // falls in, and the row underneath narrows it to one exact length WITHIN that band — so the
  // two controls are coarse-then-fine rather than two competing lists.
  const band = bandForNights(nights);
  const exactLengths = lengthsInBand(band);

  return (
    <div className={styles.bar} ref={barRef}>
      <div className={styles.fields}>
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <button type="button" className={styles.trigger}
            onClick={() => { dateRef.current?.showPicker?.(); dateRef.current?.focus(); }}>
            <span className={styles.ico}>{ICONS.cal}</span>
            <span className={styles.body}>
              <span className={styles.label}>Departure date</span>
              <span className={styles.value}>{checkIn ? formatDate(checkIn) : 'Pick a date'}</span>
            </span>
            <Chevron />
          </button>
          <input ref={dateRef} type="date" className={styles.dateHidden} value={checkIn || ''} min={today}
            onChange={(e) => { if (e.target.value) onChange({ checkIn: e.target.value }); }} />
        </div>

        <Field id="pax" icon={ICONS.users} label="Travelling company" value={paxLabel}
          open={openField === 'pax'} onToggle={toggle} wide>
          <div className={styles.roomScroll}>
            {draft.map((room, ri) => {
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
                  {room.children > 0 && (
                    <div className={styles.dobSection}>
                      <span className={styles.dobTitle}>Children's date of birth</span>
                      {room.dobs.map((dob, ci) => {
                        const age = ageFromDob(dob);
                        return (
                          <div className={styles.dobRow} key={ci}>
                            <span className={styles.dobLabel}>
                              Child {ci + 1}{age != null ? <em className={styles.dobAge}>{age} yr{age === 1 ? '' : 's'}</em> : ''}
                            </span>
                            <input type="date" className={styles.dobInput} value={dob} max={today}
                              onChange={(e) => updateChildDob(ri, ci, e.target.value)}
                              aria-label={`Date of birth of child ${ci + 1} in room ${ri + 1}`} />
                          </div>
                        );
                      })}
                      <span className={styles.dobHint}>Children's ages help us price rooms &amp; flights correctly.</span>
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
          {boardHint && <p className={styles.listHint}>{boardHint}</p>}
        </Field>

        {/* The field states the MODE, not just an airport — an own-transport stay used to
            read "Brussels (BRU) → AYT" here, advertising a flight that was never searched. */}
        <Field id="origin" icon={ICONS.plane} label="Transport" open={openField === 'origin'} onToggle={toggle}
          value={transport === 'hotel_only'
            ? 'Own transport'
            : `${originLabel(origin)} (${origin})${destination ? ` → ${destination}` : ''}`} wide>
          <div className={styles.modeRow} role="radiogroup" aria-label="Transport mode">
            <button type="button"
              className={`${styles.modeBtn}${transport !== 'hotel_only' ? ` ${styles.modeBtnOn}` : ''}`}
              role="radio" aria-checked={transport !== 'hotel_only'}
              onClick={() => onChange({ transport: 'package' })}>
              Incl. flight
            </button>
            <button type="button"
              className={`${styles.modeBtn}${transport === 'hotel_only' ? ` ${styles.modeBtnOn}` : ''}`}
              role="radio" aria-checked={transport === 'hotel_only'}
              onClick={() => { onChange({ transport: 'hotel_only' }); close(); }}>
              Own transport
            </button>
          </div>
          {transport !== 'hotel_only' && (
            <>
              <div className={styles.popTitle}>Flying from</div>
              <OptionList scroll current={origin}
                options={originOptions.map((o) => ({
                  id: o, label: `${originLabel(o)} (${o})`, note: destination ? `→ ${destination}` : null,
                }))}
                onPick={(o) => { onChange({ origin: o }); close(); }} />
            </>
          )}
        </Field>

        {/* Day-bands, worded exactly as the home page words them — a traveller who searched
            "6-10 days" sees "6-10 days" here, not a nights figure they have to re-derive.
            Picking a band jumps to that band's representative length. */}
        <Field id="nights" icon={ICONS.moon} label="Duration" value={band.label}
          open={openField === 'nights'} onToggle={toggle}>
          <OptionList current={band.label}
            options={DURATION_BANDS.map((b) => ({ id: b.label, label: b.label }))}
            onPick={(label) => { onChange({ nights: bandByLabel(label).nights }); close(); }} />
        </Field>
      </div>

      <div className={styles.foot}>
        <span className={styles.footLabel}>Exact length</span>
        <div className={styles.chips}>
          {exactLengths.map((n) => (
            <button type="button" key={n} className={`${styles.chip}${nights === n ? ` ${styles.chipOn}` : ''}`}
              onClick={() => onChange({ nights: n })} aria-pressed={nights === n}>
              {n} days
            </button>
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
