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
