// The airports a Flight + Hotel search can actually use (admin GET /flight-availability/feasibility
// with `destinations`, 7 Oct 2026): the departure airports and arrival airports with at least one
// valid package round trip for these hotel destinations and dates, under every package rule. The
// results page and the hotel page list only these. While the answer is loading, or when it could
// not be read, nothing is hidden: an unknown is never shown as "no flights".
import { useEffect, useState } from 'react';
import axiosInstance from '../services/axiosInstance';

/**
 * @param {object} q  enabled, destinations[], hotelCode?, from?, to?, travelDays?, adults, children, childAges
 * @returns {{ origins: Set<string>|null, arrivals: Object<string, {status, trips}>|null, state: 'idle'|'loading'|'ok'|'error' }}
 */
export function usePackageAirports(q) {
  const dests = (q.destinations || []).filter(Boolean);
  const key = q.enabled && dests.length
    ? [dests.join(','), q.hotelCode || '', q.from || '', q.to || '', q.travelDays || '', q.adults, q.children, q.childAges || ''].join('|')
    : '';
  const [answer, setAnswer] = useState({ key: '', origins: null, arrivals: null, state: 'idle' });

  useEffect(() => {
    if (!key) return undefined;
    const ctrl = new AbortController();
    const params = { destinations: dests.slice(0, 60).join(','), adults: q.adults, children: q.children };
    if (q.hotelCode) params.hotelCode = String(q.hotelCode);
    if (q.from) params.from = q.from;
    if (q.to) params.to = q.to;
    if (q.travelDays) params.travelDays = String(q.travelDays);
    if (q.childAges) params.childAges = q.childAges;
    axiosInstance.get('/flight-availability/feasibility', { params, signal: ctrl.signal })
      .then(({ data }) => {
        if (!data?.success || !Array.isArray(data.origins)) throw new Error('feasibility answered without origins');
        setAnswer({ key, origins: new Set(data.origins), arrivals: data.arrivals || {}, state: 'ok' });
      })
      .catch(() => { if (!ctrl.signal.aborted) setAnswer({ key, origins: null, arrivals: null, state: 'error' }); });
    return () => ctrl.abort();
    // `key` names every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = !!key && answer.key === key;
  return {
    origins: current ? answer.origins : null,
    arrivals: current ? answer.arrivals : null,
    state: !key ? 'idle' : current ? answer.state : 'loading',
  };
}

export default usePackageAirports;
