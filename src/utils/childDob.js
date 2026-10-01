/**
 * Children travel on a DATE and are priced on an AGE, and the two are collected in one place
 * (the search bar's date-of-birth pickers) and consumed in another (the supplier call, then the
 * checkout form). This module owns the conversion between them so the rule cannot drift:
 *
 *   search bar  → dates typed by the traveller
 *   supplier    → ages derived from those dates AT CHECK-IN
 *   checkout    → the dates again, pre-filled, because a booking is made on the document
 *
 * Nothing here guesses. A missing or unparseable date returns null and the caller decides;
 * a padded default age is fine for a price estimate but never for a passenger record.
 */

/**
 * A child's age on the day they travel — the age every supplier prices against. A child who
 * turns 12 between booking and check-in is a 12-year-old to the hotel, so the reference date
 * is the check-in, not today.
 *
 * Parsed at LOCAL midnight (`T00:00:00`), never through toISOString(), which is a day out for
 * anyone east of Greenwich and would age a child down by a year on their birthday.
 *
 * @param {string} dob      ISO date, "2009-02-16"
 * @param {string} [checkIn] ISO date; defaults to today
 * @returns {number|null} whole years, floored at 0, or null if either date is unusable
 */
export const ageAtCheckIn = (dob, checkIn) => {
  if (!dob) return null;
  const b = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  const ref = checkIn ? new Date(`${checkIn}T00:00:00`) : new Date();
  if (Number.isNaN(ref.getTime())) return null;
  let a = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) a -= 1;
  return a >= 0 ? a : 0;
};

/** "2009-02-16,2015-07-01" → "17,11" for the given check-in. Unusable dates become ''. */
export const agesFromDobs = (dobs, checkIn) => {
  if (!dobs) return '';
  return dobs
    .split(',')
    .map((d) => ageAtCheckIn(d.trim(), checkIn))
    .map((a) => (a == null ? '' : String(a)))
    .join(',');
};

/**
 * Are these dates still the ones the current ages came from?
 *
 * The results sidebar edits AGES directly, so a traveller who bumps a child from 8 to 11
 * leaves the date behind. Handing that date on anyway would pre-fill the checkout with a
 * birthday that contradicts the price on screen — and the booking would then be made for a
 * different child than the one that was quoted. When they disagree, the date is dropped and
 * the checkout asks for it.
 *
 * @param {string} dobs    csv of ISO dates
 * @param {string} ages    csv of ages, as sent to the supplier
 * @param {string} checkIn ISO check-in date the ages were computed for
 */
export const dobsMatchAges = (dobs, ages, checkIn) => {
  if (!dobs || ages == null || ages === '') return false;
  const derived = dobs.split(',').map((d) => ageAtCheckIn(d.trim(), checkIn));
  if (derived.some((a) => a == null)) return false;
  return derived.join(',') === String(ages).trim();
};

/* ── Date of birth as three fields ──────────────────────────────────────────────
   The DOB selector collects a day, a month and a year separately rather than through a
   calendar, because reaching 2018 in a travel calendar means paging back ninety months.
   That makes partial state normal — a year picked and no day yet — so the parsing and the
   validation below both have to survive it rather than treating it as an error. */

/** ISO "2018-08-14" → { day: 14, month: 8, year: 2018 }; anything unusable → empty parts. */
export const dobToParts = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return { day: '', month: '', year: '' };
  return { day: Number(m[3]), month: Number(m[2]), year: Number(m[1]) };
};

/**
 * { day, month, year } → ISO, or '' while any part is still missing.
 *
 * Deliberately does NOT reject 31 February: the selector has to be able to hold a half-built
 * date the customer is still typing their way through, and telling them off mid-edit is how a
 * form becomes unpleasant. validateDob decides what is real, once.
 */
export const partsToDob = ({ day, month, year } = {}) => {
  const d = Number(day); const mo = Number(month); const y = Number(year);
  if (!d || !mo || !y) return '';
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

/** Days in a month, leap years included. Used to trim the day list as the month changes. */
export const daysInMonth = (month, year) => {
  const mo = Number(month); const y = Number(year);
  if (!mo) return 31;
  if (!y) return mo === 2 ? 29 : new Date(2000, mo, 0).getDate();   // no year yet: allow Feb 29
  return new Date(y, mo, 0).getDate();
};

/** A validation failure, as a code. The wording lives in the locale files. */
export const DOB_ERROR = Object.freeze({
  INCOMPLETE: 'INCOMPLETE',
  IMPOSSIBLE: 'IMPOSSIBLE',
  FUTURE: 'FUTURE',
});

/**
 * Is this a date of birth we can price a passenger on?
 *
 * Checks exactly what the specification asks for: complete, real, not in the future, and an
 * age that can actually be computed against the travel date. Returns the age too, since every
 * caller that validates also wants to classify.
 *
 * @param {string} iso        the assembled date, or '' if incomplete
 * @param {object} [opts]
 * @param {string} [opts.travelDate] ISO check-in; the age is computed against this, not today
 * @returns {{ok: true, age: number} | {ok: false, code: string}}
 */
export function validateDob(iso, { travelDate } = {}) {
  if (!iso) return { ok: false, code: DOB_ERROR.INCOMPLETE };

  const parts = dobToParts(iso);
  if (!parts.year) return { ok: false, code: DOB_ERROR.INCOMPLETE };

  // A Date built from an impossible day rolls over — 2018-02-31 becomes 3 March — so the only
  // reliable check is whether the date we get back is the date we asked for.
  const d = new Date(parts.year, parts.month - 1, parts.day);
  const real = d.getFullYear() === parts.year
    && d.getMonth() === parts.month - 1
    && d.getDate() === parts.day;
  if (!real) return { ok: false, code: DOB_ERROR.IMPOSSIBLE };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d.getTime() > today.getTime()) return { ok: false, code: DOB_ERROR.FUTURE };

  const age = ageAtCheckIn(iso, travelDate);
  if (age == null) return { ok: false, code: DOB_ERROR.IMPOSSIBLE };
  return { ok: true, age };
}

/** Every child in every room has a usable date of birth. The gate on Save Changes. */
export const allDobsValid = (rooms, travelDate) =>
  (rooms || []).every((room) => (room?.dobs || [])
    .slice(0, Number(room?.children) || 0)
    .every((dob) => validateDob(dob, { travelDate }).ok));
