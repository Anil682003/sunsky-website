import { useState } from 'react';
import styles from './DateCalendar.module.css';

/**
 * The date picker the search bar opens — a real calendar, not the browser's.
 *
 * `<input type="date">.showPicker()` was doing this job, which meant the picker looked like
 * Chrome on Chrome and like Safari on Safari, opened wherever the browser felt like, and could
 * not show a second month, a price hint, or the ± flexible-day choice next to the dates. This
 * renders the months itself so the whole thing is one design on every browser.
 *
 * Everything is plain calendar arithmetic on LOCAL dates and hand-formatted ISO strings. There
 * is deliberately no `toISOString()` here: that converts to UTC first, so a date built at
 * midnight in Brussels comes back as the day before.
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Monday-first, the way the Belgian market reads a calendar.
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad2 = (n) => String(n).padStart(2, '0');
const toISO = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

/** "2026-09-14" → {y:2026, m:8, d:14}; anything unparseable → null. */
function parseISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  return { y: +m[1], m: +m[2] - 1, d: +m[3] };
}

const addMonths = ({ y, m }, delta) => {
  const total = y * 12 + m + delta;
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
};

/** The cells of one month: leading blanks so the 1st lands under its weekday, then the days. */
function monthCells(y, m) {
  const firstWeekday = (new Date(y, m, 1).getDay() + 6) % 7;   // JS weeks start Sunday; ours don't
  const dayCount = new Date(y, m + 1, 0).getDate();
  const cells = Array.from({ length: firstWeekday }, () => null);
  for (let d = 1; d <= dayCount; d++) cells.push(d);
  return cells;
}

const FLEX_OPTIONS = [
  { value: 0, label: 'Exact dates' },
  { value: 1, label: '± 1 day' },
  { value: 2, label: '± 2 days' },
  { value: 3, label: '± 3 days' },
];

/**
 * @param value        selected date, ISO (YYYY-MM-DD) or ''
 * @param onChange     (iso) => void
 * @param min          earliest selectable date, ISO — days before it are shown but dead
 * @param months       how many months to show side by side (2 on desktop; the CSS hides the
 *                     second one on phones, so the traveller never scrolls sideways)
 * @param flex         ± days currently chosen; pass with onFlexChange to show the strip
 * @param onFlexChange (n) => void — omit to hide the flexible-dates strip entirely
 * @param onDone       called by the Done button and by picking a day when there is no strip
 */
export default function DateCalendar({
  value,
  onChange,
  min,
  months = 2,
  flex,
  onFlexChange,
  onDone,
}) {
  const selected = parseISO(value);
  const floor = parseISO(min);
  const today = new Date();
  const todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate());

  // Open on the month the traveller is already looking at: their chosen date, else the
  // earliest one they're allowed to pick, else this month.
  const [view, setView] = useState(() => {
    const start = selected || floor || { y: today.getFullYear(), m: today.getMonth() };
    return { y: start.y, m: start.m };
  });

  // Nothing before the month the floor sits in — paging back to empty months is a dead end.
  const canGoBack = !floor || view.y * 12 + view.m > floor.y * 12 + floor.m;
  const shift = (delta) => {
    if (delta < 0 && !canGoBack) return;
    setView((v) => addMonths(v, delta));
  };

  const showFlex = typeof onFlexChange === 'function';

  const pick = (iso) => {
    onChange?.(iso);
    // With the flexible strip open the panel stays put — the traveller has a second choice to
    // make right below the dates. Without it, the date WAS the question, so it closes.
    if (!showFlex) onDone?.();
  };

  const chevron = (dir) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'prev' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  );

  return (
    <div className={styles.cal} onClick={(e) => e.stopPropagation()}>
      <div className={styles.months}>
        {Array.from({ length: months }, (_, i) => {
          const { y, m } = addMonths(view, i);
          return (
            <div className={styles.month} key={`${y}-${m}`}>
              <div className={styles.monthHead}>
                <button type="button" className={styles.navBtn} disabled={!canGoBack}
                  onClick={() => shift(-1)} aria-label="Previous month">
                  {chevron('prev')}
                </button>
                <span className={styles.monthName}>{MONTH_NAMES[m]} {y}</span>
                <button type="button" className={styles.navBtn}
                  onClick={() => shift(1)} aria-label="Next month">
                  {chevron('next')}
                </button>
              </div>

              <div className={styles.weekRow}>
                {WEEKDAYS.map((w) => <span key={w} className={styles.weekday}>{w}</span>)}
              </div>

              <div className={styles.grid}>
                {monthCells(y, m).map((d, idx) => {
                  if (d === null) return <span key={`b${idx}`} className={styles.blank} />;
                  const iso = toISO(y, m, d);
                  const disabled = min ? iso < min : false;
                  const isSelected = value === iso;
                  return (
                    <button
                      type="button"
                      key={iso}
                      className={`${styles.day} ${isSelected ? styles.daySelected : ''} ${iso === todayISO ? styles.dayToday : ''}`}
                      disabled={disabled}
                      aria-pressed={isSelected}
                      aria-label={`${d} ${MONTH_NAMES[m]} ${y}`}
                      onClick={() => pick(iso)}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {showFlex && (
        <div className={styles.foot}>
          <div className={styles.flexRow} role="radiogroup" aria-label="Date flexibility">
            {FLEX_OPTIONS.map((o) => (
              <button
                type="button"
                key={o.value}
                role="radio"
                aria-checked={flex === o.value}
                className={`${styles.flexPill} ${flex === o.value ? styles.flexPillOn : ''}`}
                onClick={() => onFlexChange(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
          {onDone && (
            <button type="button" className={styles.calDone} onClick={onDone}>Done</button>
          )}
        </div>
      )}
    </div>
  );
}
