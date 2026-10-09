// The airports a Flight + Hotel search can actually use (admin GET /flight-availability/feasibility
// with `destinations`, 7 Oct 2026): the departure airports and arrival airports with at least one
// valid package round trip for these hotel destinations and dates, under every package rule. The
// results page and the hotel page list only these. While the answer is loading, or when it could
// not be read, nothing is hidden: an unknown is never shown as "no flights".
import { useEffect, useState } from 'react';
import axiosInstance from '../services/axiosInstance';

// The admin answers at most this many destinations per request. A wider scope (a few countries)
// is asked in batches and the answers merged: cutting it at 60 left out the very destinations the
// cards came from, and every departure airport was hidden ("No airport matches that", 7 Oct 2026).
export const FEASIBILITY_BATCH = 60;

/** PURE. Merge batch answers: departure airports united, per arrival airport the most trips. */
export function mergeFeasibility(answers) {
  const origins = new Set();
  const arrivals = {};
  for (const a of answers) {
    for (const o of a.origins || []) origins.add(o);
    for (const [code, st] of Object.entries(a.arrivals || {})) {
      if (!arrivals[code] || (st?.trips || 0) > (arrivals[code].trips || 0)) arrivals[code] = st;
    }
  }
  return { origins, arrivals };
}

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
    const base = { adults: q.adults, children: q.children };
    if (q.hotelCode) base.hotelCode = String(q.hotelCode);
    if (q.from) base.from = q.from;
    if (q.to) base.to = q.to;
    if (q.travelDays) base.travelDays = String(q.travelDays);
    if (q.childAges) base.childAges = q.childAges;
    const batches = [];
    for (let i = 0; i < dests.length; i += FEASIBILITY_BATCH) batches.push(dests.slice(i, i + FEASIBILITY_BATCH));
    // One failed batch fails the whole answer: a partial list would hide real airports.
    Promise.all(batches.map((b) => axiosInstance.get('/flight-availability/feasibility', { params: { ...base, destinations: b.join(',') }, signal: ctrl.signal })
      .then(({ data }) => {
        if (!data?.success || !Array.isArray(data.origins)) throw new Error('feasibility answered without origins');
        return data;
      })))
      .then((answers) => {
        const merged = mergeFeasibility(answers);
        setAnswer({ key, origins: merged.origins, arrivals: merged.arrivals, state: 'ok' });
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
