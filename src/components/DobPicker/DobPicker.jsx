import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './DobPicker.module.css';
import {
  dobToParts, partsToDob, daysInMonth, validateDob, DOB_ERROR,
} from '../../utils/childDob';

/**
 * A child's date of birth, as three fields.
 *
 * WHY NOT THE TRAVEL CALENDAR. It was an `<input type="date">`, which opens the browser's own
 * picker on the month you are travelling — so entering a 2018 birthday meant paging back
 * ninety months, on a control that looks like Chrome on Chrome and like Safari on Safari. A
 * birth date and a departure date are opposite problems: one is a known number you want to
 * type, the other is a choice you want to see laid out. They should not share a component.
 *
 * WHY THE DAY LIST IS BUILT FROM THE MONTH. Offering 31 days in February and then rejecting
 * the 30th is a form arguing with the person filling it in. The list shortens as soon as the
 * month is known; with no year yet it allows the 29th, because a leap year is still possible.
 *
 * The label sits ABOVE the fields. On one line with them, as it was, the whole control was
 * squeezed into whatever space the label left and became unusable on a phone.
 */

const MONTHS_EN = 'January,February,March,April,May,June,July,August,September,October,November,December';

/** Nobody booking a children's fare was born before this. Keeps the year list finite. */
const OLDEST_YEARS = 30;

export default function DobPicker({
  label,
  value = '',
  onChange,
  travelDate,
  /** Show the error even when the field is untouched — set by a failed Save. */
  showError = false,
  id,
}) {
  const { t } = useTranslation('common');
  const months = t('dob.months', MONTHS_EN).split(',');

  /**
   * THE HALF-BUILT DATE LIVES HERE, not in the parent.
   *
   * The parent stores one ISO string, and a day with no month and no year is not one — so
   * every partial selection assembles to '' and, if that were the only state, came straight
   * back as an empty control. Picking "14" cleared itself and no date could ever be entered.
   *
   * So the three fields are held locally and only published once they make a real date. The
   * parent's value still wins whenever it changes from outside (a child removed from a room
   * shifts everyone else's date up a slot), which is the adjust-state-on-prop-change pattern
   * rather than an effect: it re-renders once, before anything is painted.
   */
  const [parts, setParts] = useState(() => dobToParts(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    // Only when it disagrees with what is on screen — otherwise publishing our own complete
    // date would bounce straight back and wipe the parts we just set.
    if (value !== partsToDob(parts)) setParts(dobToParts(value));
  }

  const thisYear = new Date().getFullYear();
  const years = useMemo(
    () => Array.from({ length: OLDEST_YEARS + 1 }, (_, i) => thisYear - i),
    [thisYear],
  );
  const dayCount = daysInMonth(parts.month, parts.year);
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => i + 1),
    [dayCount],
  );

  // Validated against what is actually on screen, so a date half-entered reads as unfinished
  // rather than as whatever the parent last managed to store.
  const assembled = partsToDob(parts);
  const check = validateDob(assembled, { travelDate });
  // An incomplete date is not yet wrong, it is unfinished — so it only reads as an error once
  // something has actually asked for it (a Save attempt). A date that is complete and
  // impossible is wrong straight away, because nothing more is going to fix it.
  const invalid = !check.ok && (showError || check.code !== DOB_ERROR.INCOMPLETE);

  const set = (field, raw) => {
    const next = { ...parts, [field]: raw === '' ? '' : Number(raw) };
    // Changing to a shorter month strands a day that no longer exists. Clamp rather than
    // silently emitting 31 November and calling it invalid a moment later.
    const max = daysInMonth(next.month, next.year);
    if (next.day && next.day > max) next.day = max;
    setParts(next);
    // '' while it is still incomplete, which is exactly what the parent should store: a
    // partial date is not a date of birth, and Save is gated on there being one.
    const iso = partsToDob(next);
    setLastValue(iso);
    onChange?.(iso);
  };

  const errorText = () => {
    switch (check.code) {
      case DOB_ERROR.FUTURE: return t('dob.errorFuture', 'That date is in the future.');
      case DOB_ERROR.IMPOSSIBLE: return t('dob.errorImpossible', 'Please enter a valid date of birth.');
      default: return t('dob.errorIncomplete', 'Please enter a valid date of birth.');
    }
  };

  const fieldCls = `${styles.field} ${invalid ? styles.fieldError : ''}`;
  const errId = invalid ? `${id}-error` : undefined;

  return (
    <div className={styles.wrap}>
      <span className={styles.label} id={`${id}-label`}>{label}</span>

      <div className={styles.fields} role="group" aria-labelledby={`${id}-label`} aria-describedby={errId}>
        <select
          className={fieldCls}
          value={parts.day || ''}
          onChange={(e) => set('day', e.target.value)}
          aria-label={t('dob.day', 'Day')}
          aria-invalid={invalid || undefined}
        >
          <option value="">{t('dob.day', 'Day')}</option>
          {days.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>

        <select
          className={`${fieldCls} ${styles.fieldMonth}`}
          value={parts.month || ''}
          onChange={(e) => set('month', e.target.value)}
          aria-label={t('dob.month', 'Month')}
          aria-invalid={invalid || undefined}
        >
          <option value="">{t('dob.month', 'Month')}</option>
          {months.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
        </select>

        <select
          className={fieldCls}
          value={parts.year || ''}
          onChange={(e) => set('year', e.target.value)}
          aria-label={t('dob.year', 'Year')}
          aria-invalid={invalid || undefined}
        >
          <option value="">{t('dob.year', 'Year')}</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Underneath this child's own fields, never collected into one notice at the top of the
          sidebar: with two children in two rooms, a single "check your dates" tells nobody
          which of the four controls to look at. */}
      {invalid && (
        <p className={styles.error} id={errId} role="alert">{errorText()}</p>
      )}

      {/* The age is the reason the date is being asked for, so it is shown as soon as it can
          be worked out. It also makes a mistyped year obvious at a glance. */}
      {check.ok && (
        <p className={styles.age}>
          {t('dob.ageAtTravel', { count: check.age, defaultValue_one: '{{count}} year old when you travel', defaultValue_other: '{{count}} years old when you travel' })}
        </p>
      )}
    </div>
  );
}
