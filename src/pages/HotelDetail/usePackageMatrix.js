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
 * @param {object} q  enabled, hotelCode, destination, date (departure, YYYY-MM-DD), travelDays,
 *                    origin, adults, children, childAges (csv), rooms, routing ('nonstop' | ''),
 *                    reload (a counter: a new value asks again)
 * @returns {{ scope: string, loading: boolean, error: object|null, days: object[], prev: string|null, next: string|null, status: string|null }}
 */
export function usePackageMatrix(q) {
  const scope = q.enabled && q.hotelCode && q.destination && q.date
    ? [q.hotelCode, q.destination, q.date, q.travelDays, q.origin, q.adults, q.children, q.childAges, q.rooms, q.routing, q.reload].join('|')
    : '';
  const [answer, setAnswer] = useState({ scope: '', days: [], prev: null, next: null, status: null, error: null });

  useEffect(() => {
    if (!scope) return undefined;
    const ctrl = new AbortController();
    const params = {
      hotelCode: String(q.hotelCode), destination: q.destination, date: q.date,
      travelDays: String(q.travelDays || ''), origins: q.origin || '',
      adults: q.adults, children: q.children, rooms: q.rooms,
    };
    if (q.childAges) params.childAges = q.childAges;
    if (q.routing) params.routing = q.routing;
    axiosInstance.get('/flight-availability/package-matrix', { params, signal: ctrl.signal })
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
