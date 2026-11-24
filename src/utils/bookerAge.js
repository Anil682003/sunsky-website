/**
 * The main booker must be at least 18 on the day of booking (Levent, 24 Nov 2026). Travellers
 * under 18 may still travel; they cannot make the booking. The server checks the same rule
 * (admin website/services/bookerAge.js), so a bypassed page still cannot book.
 */
export const MIN_BOOKER_AGE = 18;

const todayIso = (now = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

/** PURE. Full years on `today` (YYYY-MM-DD) for a YYYY-MM-DD birth date; null when not valid. */
export function ageOn(dateOfBirth, today = todayIso()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateOfBirth || ''));
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(today || ''));
  if (!m || !t || String(dateOfBirth) > String(today)) return null;
  const [by, bm, bd] = m.slice(1).map(Number);
  const [ty, tm, td] = t.slice(1).map(Number);
  return ty - by - ((tm < bm || (tm === bm && td < bd)) ? 1 : 0);
}

/** PURE. Is this booker under 18 today? false when the date is missing or not valid (other rules say so). */
export const bookerUnderage = (dateOfBirth, today) => {
  const age = ageOn(dateOfBirth, today);
  return age != null && age < MIN_BOOKER_AGE;
};
