/**
 * How soon a holiday may start.
 *
 * A booking needs time to reach the supplier, be confirmed, and reach the traveller as
 * documents — so nothing may depart or check in within 24 HOURS of now. The rule is measured
 * in BELGIAN time, not the traveller's: SUNSKY sells from Belgium, and a customer opening the
 * site from Antalya (or with a laptop clock two days out) must be offered the same dates as
 * one sitting in Brussels.
 *
 * Two layers, because a date and a departure are different things:
 *
 *   earliestCheckInISO()  — the floor for every date picker and the fare strip. It is the
 *                           Belgian calendar date of "now + 24h", so today is never offered
 *                           and the earliest day shown is always at least tomorrow.
 *   departsTooSoon(when)  — the exact check, once a real departure time is known. A flight
 *                           leaving tomorrow at 06:00 is inside the window even though its
 *                           DATE passed the floor above.
 */

export const MIN_LEAD_HOURS = 24;
const MIN_LEAD_MS = MIN_LEAD_HOURS * 60 * 60 * 1000;

// 'en-CA' formats as YYYY-MM-DD, which is the shape every date input and every supplier call
// on this site already speaks.
const BRUSSELS_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** The date it is in Belgium at the given moment (default: now), as YYYY-MM-DD. */
export const brusselsDateISO = (at = new Date()) => BRUSSELS_DATE.format(at);

/**
 * The earliest check-in / departure DATE anyone may pick: the Belgian date 24 hours from now.
 *
 * At 23:00 on the 9th that is the 10th; at 00:30 on the 10th it is the 11th. Either way today
 * is gone, which is the point — a same-day departure cannot be confirmed in time.
 */
export const earliestCheckInISO = (now = Date.now()) =>
  brusselsDateISO(new Date(now + MIN_LEAD_MS));

/** Clamp a date to that floor. An empty value stays empty — absent is not "too early". */
export const notBeforeEarliest = (iso, now = Date.now()) => {
  if (!iso) return iso;
  const floor = earliestCheckInISO(now);
  return iso < floor ? floor : iso;
};

/**
 * Is this specific departure inside the 24-hour window?
 *
 * `when` is a supplier timestamp ("2026-09-07T09:00:00") or an ISO date. A bare date is read
 * as the START of that day, which is the strictest reading and the right one: if the earliest
 * moment of the day is too soon, the day cannot be offered.
 */
export const departsTooSoon = (when, now = Date.now()) => {
  if (!when) return false;                       // nothing stated → nothing to refuse
  const s = String(when);
  const t = Date.parse(/\d{2}:\d{2}/.test(s) ? s : `${s.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(t)) return false;
  return t - now < MIN_LEAD_MS;
};

export default { MIN_LEAD_HOURS, brusselsDateISO, earliestCheckInISO, notBeforeEarliest, departsTooSoon };
