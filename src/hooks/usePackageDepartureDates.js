// Which departure dates a Flight + Hotel search can actually fly (UI-01, UI-02 / Ch1 §7, §9A).
//
// The calendar greys a day only when we KNOW no valid round trip leaves on it. Everything else
// stays selectable: a loading answer, a failed request, a destination the cache cannot judge, or
// a question too wide to ask. That asymmetry is the whole point — "unknown is not impossible", and
// a greyed day the traveller could in fact have flown is a lost sale we never find out about.
//
// Asked with `destinations=` (hotel destination codes), which is what the search already has.
//
// It used to go the long way round. The endpoint had two branches and only `arrivals=` (destination
// AIRPORT codes, at most ten) carried `departureDates`, so this hook waited for usePackageAirports
// to turn destinations into airports and then asked again. The cache team added departureDates to
// the destinations branch on 16 Oct 2026, so one question answers it.
//
// That is not only tidier: the old cap was ten ARRIVAL AIRPORTS, and a search across a few
// countries passes ten long before it runs out of destinations, at which point the calendar greyed
// nothing at all. The limit is now sixty destinations, matching the server's
// MAX_FEASIBILITY_DESTINATIONS, so the greying actually works on the wide searches that need it
// most.
import { useEffect, useState } from 'react';
import axiosInstance from '../services/axiosInstance';
// One definition of ISO date arithmetic. packageResults.js is a pure module (no JSX, no React)
// and already carries this, tested; a second copy here is how the two drift apart.
import { isoAddDays } from '../pages/Results/packageResults';

/**
 * The endpoint refuses more than this many destinations in one question.
 * Mirrors MAX_FEASIBILITY_DESTINATIONS in packageFeasibility.controller.js.
 */
export const MAX_DESTINATIONS = 60;

/** The endpoint refuses a window longer than this, so a range is asked in chunks. */
export const WINDOW_DAYS = 31;

/**
 * PURE. Split a date range into windows the endpoint will accept.
 * Inclusive of both ends; an empty or reversed range asks nothing.
 */
export function dateWindows(from, to, size = WINDOW_DAYS) {
  if (!from || !to || to < from) return [];
  const out = [];
  let start = from;
  while (start <= to) {
    const end = isoAddDays(start, size - 1);
    out.push({ from: start, to: end > to ? to : end });
    start = isoAddDays(end, 1);
  }
  return out;
}

/**
 * PURE. Fold the answers into the set of dates we can prove are flyable, or null for "we cannot say".
 *
 * null is returned whenever the answer cannot carry that proof:
 *  - `truncated`, which the contract defines as an incomplete answer;
 *  - any arrival airport reported UNKNOWN (NO_RETURN_FARES and friends). Its flyable dates are
 *    simply missing from `departureDates`, so treating absence as impossible would grey days that
 *    do work. The contract says so in as many words: "UNKNOWN is not impossible."
 *
 * Note this is all-or-nothing across the batch rather than per airport: the dates are a union over
 * airports, so one unjudgeable airport poisons the union. Greying "no flight from any of these"
 * when we only know about some of them is exactly the wrong answer.
 */
export function mergeDepartureDates(answers) {
  const dates = new Set();
  for (const a of answers) {
    if (!a || a.truncated) return null;
    const arrivals = a.arrivals || {};
    for (const st of Object.values(arrivals)) {
      if (st?.status === 'UNKNOWN') return null;
    }
    for (const d of a.departureDates || []) {
      if (d?.date) dates.add(d.date);
    }
  }
  return dates;
}

/**
 * PURE. The predicate DateCalendar asks, built from what we know.
 *
 * @param dates  Set of flyable ISO dates, or null when unknown
 * @param flex   ± days the traveller accepts. A day counts as flyable when ANY day inside its
 *               window is, because that is exactly what the search will do with it. Greying a
 *               Tuesday that has no flight while ±2 is on would contradict the search that follows.
 * @param range  { from, to } the window actually asked about. We only ask a few months ahead, so
 *               a day outside it was never judged and must stay selectable: paging the calendar
 *               to next summer would otherwise grey every day of it on the strength of an answer
 *               about November. Omitting the range judges everywhere, which only suits tests.
 * @returns (iso) => boolean, or null when nothing should be greyed at all
 */
export function makeIsUnavailable(dates, flex = 0, range = null) {
  if (!dates) return null;
  // An empty set with a successful answer is a real answer: nothing flies in this window.
  const span = Math.max(0, Number(flex) || 0);
  return (iso) => {
    if (range && (iso < range.from || iso > range.to)) return false;
    for (let d = -span; d <= span; d += 1) {
      if (dates.has(d === 0 ? iso : isoAddDays(iso, d))) return false;
    }
    return true;
  };
}

/**
 * PURE. What the calendar can say out loud about the answer (UI-02 / Ch1 §9A).
 *
 * `makeIsUnavailable` answers "is this day greyed", one day at a time, which is all the greying
 * needs and no use for "which month should open". This reduces the same answer to the two facts
 * the calendar states: the first day that flies, and how many do.
 *
 * The count is of days that genuinely fly, not of days the calendar leaves selectable. With ±2
 * on, more days stay clickable than fly, and saying "9 possible departure dates found" when
 * three of them are only reachable by shifting would be a larger claim than the cache made.
 *
 * @param dates Set of flyable ISO dates, or null when we cannot say
 * @returns {{ earliest: string, count: number }|null} — null when unknown OR when nothing flies,
 *          because "the earliest departure is nothing" is not a sentence worth printing.
 */
export function departureSummary(dates) {
  if (!dates || dates.size === 0) return null;
  let earliest = null;
  for (const iso of dates) if (earliest === null || iso < earliest) earliest = iso;
  return { earliest, count: dates.size };
}

/**
 * @param {object} q  enabled, destinations[] (hotel destination codes), hotelCode?, origins[]?,
 *                    from, to, travelDays?, adults, children, childAges?, routing?
 * @returns {{ dates: Set<string>|null, state: 'idle'|'loading'|'ok'|'error'|'too-wide' }}
 */
export function usePackageDepartureDates(q) {
  const destinations = [...new Set((q.destinations || []).filter(Boolean))].sort();
  const origins = [...new Set((q.origins || []).filter(Boolean))].sort();

  // More destinations than the endpoint will take. We could ask about sixty of them, but the
  // answer would be "no flight to these sixty", and greying on it would hide days that fly to
  // the sixty-first. A search that wide simply greys nothing.
  const tooWide = destinations.length > MAX_DESTINATIONS;

  const windows = q.enabled && destinations.length && !tooWide ? dateWindows(q.from, q.to) : [];
  const key = windows.length
    ? [destinations.join(','), q.hotelCode || '', origins.join(','), q.from, q.to, q.travelDays || '', q.adults, q.children, q.childAges || '', q.routing || ''].join('|')
    : '';

  const [answer, setAnswer] = useState({ key: '', dates: null, state: 'idle' });

  useEffect(() => {
    if (!key) return undefined;
    const ctrl = new AbortController();
    const base = {
      destinations: destinations.join(','),
      adults: q.adults,
      children: q.children,
    };
    // One hotel's own question: the server narrows to the arrival airports whose GeoData scope
    // covers it, so the dates match the hotel the page is about rather than its whole destination.
    if (q.hotelCode) base.hotelCode = String(q.hotelCode);
    if (origins.length) base.origins = origins.join(',');
    if (q.travelDays) base.travelDays = String(q.travelDays);
    if (q.childAges) base.childAges = q.childAges;
    if (q.routing) base.routing = q.routing;

    // One failed window fails the whole answer. A partial union would grey the days of the month
    // we never managed to ask about.
    Promise.all(windows.map((w) => axiosInstance
      .get('/flight-availability/feasibility', { params: { ...base, from: w.from, to: w.to }, signal: ctrl.signal })
      .then(({ data }) => {
        if (!data?.success) throw new Error('feasibility refused');
        return data;
      })))
      .then((answers) => {
        setAnswer({ key, dates: mergeDepartureDates(answers), state: 'ok' });
      })
      .catch(() => { if (!ctrl.signal.aborted) setAnswer({ key, dates: null, state: 'error' }); });

    return () => ctrl.abort();
    // `key` names every input that changes the question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = !!key && answer.key === key;
  return {
    dates: current ? answer.dates : null,
    // The window the answer covers. Days outside it were never judged; see makeIsUnavailable.
    range: current && answer.state === 'ok' ? { from: q.from, to: q.to } : null,
    state: tooWide ? 'too-wide' : !key ? 'idle' : current ? answer.state : 'loading',
  };
}

export default usePackageDepartureDates;
