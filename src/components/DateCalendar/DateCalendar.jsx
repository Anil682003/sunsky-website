import { useState } from 'react';
import styles from './DateCalendar.module.css';
import { useTranslation } from 'react-i18next';

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

const MONTH_NAMES_EN = 'January,February,March,April,May,June,July,August,September,October,November,December';

// Monday-first, the way the Belgian market reads a calendar.
const WEEKDAYS_EN = 'Mon,Tue,Wed,Thu,Fri,Sat,Sun';

const pad2 = (n) => String(n).padStart(2, '0');
const toISO = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

/** "2026-09-14" → {y:2026, m:8, d:14}; anything unparseable → null. */
function parseISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  return { y: +m[1], m: +m[2] - 1, d: +m[3] };
}

/**
 * "2027-03-14" → "14 March 2027", using the same month names the grid prints.
 *
 * Built from the locale file rather than Intl for one reason: a calendar that writes "14 March"
 * in its header and "14 maart" underneath has two voices. Unparseable input returns the ISO it
 * was given, which is wrong-looking but true, and better than printing "NaN".
 */
function longDate(iso, monthNames) {
  const d = parseISO(iso);
  if (!d) return String(iso ?? '');
  return `${d.d} ${monthNames[d.m] ?? ''} ${d.y}`.replace(/\s+/g, ' ').trim();
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

const FLEX_VALUES = [0, 1, 2, 3];

/**
 * @param value        selected date, ISO (YYYY-MM-DD) or ''
 * @param onChange     (iso) => void
 * @param min          earliest selectable date, ISO — days before it are shown but dead
 * @param isUnavailable (iso) => boolean — a day that cannot produce a valid trip. Shown, greyed
 *                     and not selectable. This is how flight feasibility reaches the calendar:
 *                     the calendar itself knows nothing about flights, it just asks.
 * @param earliestAvailable ISO of the first day that CAN fly, or null when unknown. With nothing
 *                     chosen the calendar opens on that month and names the date, so a traveller
 *                     whose only flight is next March is not left paging through five empty
 *                     months to find it. Never selects it for them (Ch1 §9A).
 * @param availableCount how many days in the window can fly, or null. Stated under the grid, so
 *                     "one possible departure date" is visible rather than discovered.
 * @param legend       show the Available / Selected / Not available key underneath
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
  isUnavailable,
  earliestAvailable = null,
  availableCount = null,
  legend = false,
  months = 2,
  flex,
  onFlexChange,
  onDone,
}) {
  const { t } = useTranslation('common');
  // Month and weekday names come from the locale file rather than Intl, so the
  // short weekday matches the seven-column grid the CSS is built for.
  const MONTH_NAMES = t('calendar.months', MONTH_NAMES_EN).split(',');
  const WEEKDAYS = t('calendar.weekdays', WEEKDAYS_EN).split(',');
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

  /**
   * Jump to the first month that has a departure (UI-02 / Ch1 §9A).
   *
   * The answer arrives after the first render, so this cannot live in the useState initialiser
   * above. It runs at most once and only while the traveller has chosen nothing and has not
   * paged: moving the calendar under someone who is reading March is worse than leaving them
   * one click from the month they wanted. Once they touch it, the calendar is theirs.
   *
   * It only ever moves FORWARD, so an answer cannot drag the view behind the floor.
   */
  const [userMovedView, setUserMovedView] = useState(false);
  const [jumpedFor, setJumpedFor] = useState(null);
  // Adjusted during render rather than in an effect: React re-runs this component before it
  // paints, so the traveller never sees the wrong month flash past on its way to the right one.
  // Same pattern DestinationModal uses to follow its `open` prop.
  if (earliestAvailable && earliestAvailable !== jumpedFor && !userMovedView && !selected) {
    setJumpedFor(earliestAvailable);
    const target = parseISO(earliestAvailable);
    // Forward only, so an answer can never drag the view behind the floor.
    if (target) {
      setView((v) => (target.y * 12 + target.m > v.y * 12 + v.m ? { y: target.y, m: target.m } : v));
    }
  }

  // Nothing before the month the floor sits in — paging back to empty months is a dead end.
  const canGoBack = !floor || view.y * 12 + view.m > floor.y * 12 + floor.m;
  const shift = (delta) => {
    if (delta < 0 && !canGoBack) return;
    // From here the view is the traveller's; the feasibility answer stops moving it.
    setUserMovedView(true);
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
                  onClick={() => shift(-1)} aria-label={t('calendar.prevMonth', 'Previous month')}>
                  {chevron('prev')}
                </button>
                <span className={styles.monthName}>{MONTH_NAMES[m]} {y}</span>
                <button type="button" className={styles.navBtn}
                  onClick={() => shift(1)} aria-label={t('calendar.nextMonth', 'Next month')}>
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
                  const tooEarly = min ? iso < min : false;
                  const infeasible = !tooEarly && typeof isUnavailable === 'function' && isUnavailable(iso);
                  const isSelected = value === iso;
                  // A date the traveller explicitly chose, which another change has since made
                  // impossible, STAYS ON SCREEN and says so. Dropping it or quietly moving it
                  // to the nearest working day is how someone ends up booking a week they
                  // never picked. It is not selectable again; it is evidence of what they asked
                  // for and of what needs deciding.
                  const selectedButGone = isSelected && infeasible;
                  return (
                    <button
                      type="button"
                      key={iso}
                      className={[
                        styles.day,
                        isSelected ? styles.daySelected : '',
                        selectedButGone ? styles.daySelectedInvalid : '',
                        infeasible && !isSelected ? styles.dayUnavailable : '',
                        iso === todayISO ? styles.dayToday : '',
                      ].filter(Boolean).join(' ')}
                      disabled={tooEarly || infeasible}
                      aria-pressed={isSelected}
                      aria-label={`${d} ${MONTH_NAMES[m]} ${y}${infeasible ? `, ${t('calendar.notAvailable', 'not available')}` : ''}`}
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

      {/* What the feasibility answer says in words (UI-02). Announced politely rather than
          asserted, because it appears after the grid the traveller is already reading. The
          earliest date is dropped once they have chosen one: at that point it is answering a
          question they have moved past, and the greying says the rest. */}
      {(availableCount != null || earliestAvailable) && (
        <div className={styles.feasNote} role="status">
          {!selected && earliestAvailable && (
            <span className={styles.feasEarliest}>
              {t('feasibility.earliestDeparture', 'Earliest possible departure: {{date}}', {
                date: longDate(earliestAvailable, MONTH_NAMES),
              })}
            </span>
          )}
          {availableCount != null && (
            <span className={styles.feasCount}>
              {t('feasibility.possibleDates', {
                count: availableCount,
                defaultValue_one: '{{count}} possible departure date found',
                defaultValue_other: '{{count}} possible departure dates found',
              })}
            </span>
          )}
        </div>
      )}

      {legend && (
        <div className={styles.legend} aria-hidden="true">
          <span className={styles.legendItem}><i className={styles.dotAvailable} />{t('calendar.legendAvailable', 'Available')}</span>
          <span className={styles.legendItem}><i className={styles.dotSelected} />{t('calendar.legendSelected', 'Selected')}</span>
          <span className={styles.legendItem}><i className={styles.dotUnavailable} />{t('calendar.legendUnavailable', 'Not available')}</span>
        </div>
      )}

      {showFlex && (
        <div className={styles.foot}>
          <div className={styles.flexRow} role="radiogroup" aria-label={t('calendar.flexibility', 'Date flexibility')}>
            {FLEX_VALUES.map((v) => (
              <button
                type="button"
                key={v}
                role="radio"
                aria-checked={flex === v}
                className={`${styles.flexPill} ${flex === v ? styles.flexPillOn : ''}`}
                onClick={() => onFlexChange(v)}
              >
                {v === 0
                  ? t('calendar.exactDates', 'Exact dates')
                  : t('calendar.plusMinus', {
                      count: v,
                      defaultValue_one: '± {{count}} day',
                      defaultValue_other: '± {{count}} days',
                    })}
              </button>
            ))}
          </div>
          {onDone && (
            <button type="button" className={styles.calDone} onClick={onDone}>{t('calendar.done', 'Done')}</button>
          )}
        </div>
      )}
    </div>
  );
}
