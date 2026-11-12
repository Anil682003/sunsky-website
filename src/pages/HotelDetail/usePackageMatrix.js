// The hotel page's Flight + Hotel price strip: the package matrix (admin GET
// /flight-availability/package-matrix, final Search & Offer Contract Ch 3 §6). Up to seven
// departure dates around the asked one, each with the cheapest complete package of this hotel
// (flight + hotel, from cache data, no supplier call), so the strip quotes what the results card
// quoted and not a hotel-only price (7 Oct 2026).
import { useEffect, useState } from 'react';
import axiosInstance from '../../services/axiosInstance';
import { fromFailure } from '../../utils/availability';
import { matrixDays } from '../../utils/packageHandoff';

/**
 * The departure airports the matrix competes across, as the API's `origins` wants them.
 *
 * A LIST, not one airport (UI-03): the traveller may have ticked several on the results page, or
 * none at all, and each date should be priced from whichever of them is cheapest that day. An
 * empty string means "every active departure airport", which is what the API does without
 * `origins` — so no preference stays no preference instead of quietly becoming the airport that
 * happened to price the card they clicked.
 *
 * PURE, and exported for the tests: this is the whole difference between a strip that prices
 * seven dates from one airport and one that lets them compete.
 */
export function originsParam(origins) {
  const list = Array.isArray(origins) ? origins : String(origins || '').split(',');
  const seen = new Set();
  for (const raw of list) {
    const code = String(raw || '').trim().toUpperCase();
    if (code.length === 3) seen.add(code);
  }
  return [...seen].sort().join(',');
}

export const MATRIX_TIMEOUT_MS = 30_000;
const retryable = (e) => !e?.response || e.response.status >= 500;

const addDaysISO = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * PURE. The seven strip columns (Levent, 4 Nov 2026): the package dates as the matrix sends them
 * (dates without a valid package stay skipped: 12 Mar → 26 Mar is right), but ALWAYS seven
 * columns, the selected date in the middle with three either side whenever possible. A side with
 * fewer than three package dates is filled with the neighbouring calendar days, marked
 * "Not available" (state NO_VALID_COMBINATION, `filler: true`). Never a day before `floor`
 * (tomorrow): there the missing columns go to the other side, real dates first.
 *
 * Marseille, 4 days, 12 Mar asked (no flight before it): 9–11 Mar not available, 12 Mar,
 * 26 Mar, 14 May, 21 May; the arrow reaches 4 Jun, then 5–7 Jun are not available.
 *
 * @param days      matrix days (matrixDays), any order
 * @param selected  the departure date the strip is centred on
 * @param floor     earliest calendar day a filler may have (YYYY-MM-DD)
 * @param edges     the API's own prev/next, used when no fetched date is left hidden
 * @returns {{ days: object[], prev: string|null, next: string|null }}
 */
export function sevenColumns(days, selected, floor, edges = {}) {
  const sorted = [...(days || [])].sort((a, b) => (a.departure < b.departure ? -1 : a.departure > b.departure ? 1 : 0));
  if (!sorted.length) return { days: [], prev: edges.prev ?? null, next: edges.next ?? null };
  let at = sorted.findIndex((d) => d.departure >= selected);
  if (at < 0) at = sorted.length - 1;
  const filler = (iso) => ({ iso, departure: iso, price: 0, perPerson: null, nights: null, travelDays: null, state: 'NO_VALID_COMBINATION', filler: true, cheapest: false, pkg: null, from: null });

  // Before: up to three package dates, then calendar days down to the floor.
  const realBefore = sorted.slice(Math.max(0, at - 3), at);
  const fillBefore = [];
  let d = addDaysISO((realBefore[0] || sorted[at]).departure, -1);
  while (realBefore.length + fillBefore.length < 3 && d >= floor) { fillBefore.unshift(filler(d)); d = addDaysISO(d, -1); }
  const short = 3 - realBefore.length - fillBefore.length;   // the floor stopped us: the other side takes these

  // After: package dates first, then calendar days after the last one shown.
  const realAfter = sorted.slice(at + 1, at + 1 + 3 + short);
  const fillAfter = [];
  d = addDaysISO((realAfter[realAfter.length - 1] || sorted[at]).departure, 1);
  while (realAfter.length + fillAfter.length < 3 + short) { fillAfter.push(filler(d)); d = addDaysISO(d, 1); }

  const firstShown = at - realBefore.length;
  const lastShown = at + realAfter.length;
  return {
    days: [...fillBefore, ...realBefore, sorted[at], ...realAfter, ...fillAfter],
    prev: firstShown > 0 ? sorted[firstShown - 1].departure : (edges.prev ?? null),
    next: lastShown < sorted.length - 1 ? sorted[lastShown + 1].departure : (edges.next ?? null),
  };
}

/**
 * @param {object} q  enabled, hotelCode, destination, date (departure, YYYY-MM-DD), travelDays,
 *                    origins (array or csv; empty = every airport), adults, children,
 *                    childAges (csv), rooms, routing ('nonstop' | ''),
 *                    reload (a counter: a new value asks again)
 * @returns {{ scope: string, loading: boolean, error: object|null, days: object[], prev: string|null, next: string|null, status: string|null }}
 */
export function usePackageMatrix(q) {
  const origins = originsParam(q.origins);
  const scope = q.enabled && q.hotelCode && q.destination && q.date
    ? [q.hotelCode, q.destination, q.date, q.travelDays, origins, q.adults, q.children, q.childAges, q.rooms, q.routing, q.reload].join('|')
    : '';
  const [answer, setAnswer] = useState({ scope: '', days: [], prev: null, next: null, status: null, error: null });

  useEffect(() => {
    if (!scope) return undefined;
    const ctrl = new AbortController();
    const params = {
      hotelCode: String(q.hotelCode), destination: q.destination, date: q.date,
      travelDays: String(q.travelDays || ''), origins,
      adults: q.adults, children: q.children, rooms: q.rooms,
    };
    if (q.childAges) params.childAges = q.childAges;
    if (q.routing) params.routing = q.routing;
    // The first ask for a hotel and date computes its packages on the server and can take well
    // over the site's usual 15 s (Levent, 11 Nov: cut off, so the strip fell back to hotel-only
    // prices). This call gets 30 s and, after a timeout, a dropped connection or a 5xx, one more
    // try: by then the server has usually finished and answers from its own cache at once.
    const ask = () => axiosInstance.get('/flight-availability/package-matrix', { params, signal: ctrl.signal, timeout: MATRIX_TIMEOUT_MS });
    ask()
      .catch((e) => {
        if (ctrl.signal.aborted || !retryable(e)) throw e;
        return ask();
      })
      .then(({ data }) => {
        if (!data?.success || !Array.isArray(data.cells)) throw new SyntaxError('package matrix answered without cells');
        setAnswer({ scope, days: matrixDays(data.cells), prev: data.prev || null, next: data.next || null, status: data.status || null, error: null });
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        // A date outside the bookable horizon is an answer ("no package dates here"), not an outage.
        const code = e?.response?.data?.code;
        if (code === 'DATE_OUTSIDE_HORIZON') { setAnswer({ scope, days: [], prev: null, next: null, status: 'NO_FLIGHT_DATE', error: null }); return; }
        setAnswer({ scope, days: [], prev: null, next: null, status: null, error: fromFailure(e, { sources: ['package-matrix'] }) });
      });
    return () => ctrl.abort();
    // `scope` names every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // Only the answer to THIS question counts; anything else is still loading.
  const current = answer.scope === scope && !!scope;
  return {
    scope,
    loading: !!scope && !current,
    error: current ? answer.error : null,
    days: current ? answer.days : [],
    prev: current ? answer.prev : null,
    next: current ? answer.next : null,
    status: current ? answer.status : null,
  };
}

export default usePackageMatrix;
