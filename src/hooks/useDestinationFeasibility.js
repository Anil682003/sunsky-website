// Which destinations one departure airport can actually reach (UI-05 / Ch1 §9A, Ch3 §4A,
// cases 19 and 20).
//
// After the traveller picks Charleroi, a destination with no valid round trip from CRL is
// greyed with "Not available from Charleroi". The asymmetry is the whole point, and it is the
// same one the calendar follows: a destination is greyed only when we KNOW it cannot be flown.
// A loading answer, a failed request, or a destination the cache cannot judge all stay
// selectable, because "unknown is not impossible" and a destination greyed in error is a sale
// nobody ever finds out we lost.
//
// This is the OTHER branch of the feasibility endpoint from usePackageAirports:
//   ?destinations=  (hotel destination codes)  -> which AIRPORTS can serve them
//   ?origin=        (one departure airport)    -> which DESTINATIONS it can reach   (this hook)
// The reverse direction of UI-05 — greying airports once a destination is chosen — needs no
// new call at all: usePackageAirports already answers it with `origins`.
import { useEffect, useState } from 'react';
import axiosInstance from '../services/axiosInstance';

/**
 * PURE. The destination codes we can prove are unreachable, or null for "we cannot say".
 *
 * Only NOT_FEASIBLE is proof. UNKNOWN is the cache admitting it cannot judge — today usually
 * NO_RETURN_FARES, because the Airtürk feed had no return direction — and the contract is
 * explicit that it must never be shown as unavailable.
 *
 * A malformed or unsuccessful answer returns null rather than an empty set. Both would grey
 * nothing today, but an empty set says "everything is reachable", which is a claim this
 * function has no grounds to make and which a caller might later use to enable things.
 */
export function unreachableDestinations(data) {
  if (!data?.success || !data.destinations || typeof data.destinations !== 'object') return null;

  const out = new Set();
  for (const [code, st] of Object.entries(data.destinations)) {
    if (st?.status === 'NOT_FEASIBLE') out.add(String(code).toUpperCase());
  }
  return out;
}

/**
 * PURE. Is a whole country out of reach?
 *
 * Only when every destination we know of in it is. Ch1 §9A: "A country stays selectable if any
 * destination in it works." A country whose places have not loaded yet has no known
 * destinations, so it stays selectable — the same unknown-is-not-impossible rule one level up.
 *
 * @param codes       destination codes belonging to the country
 * @param unreachable the set from `unreachableDestinations`, or null
 */
export function isCountryUnreachable(codes, unreachable) {
  if (!unreachable || !Array.isArray(codes) || codes.length === 0) return false;
  return codes.every((c) => unreachable.has(String(c).toUpperCase()));
}

/**
 * PURE. Should this departure airport be shown as unavailable? (UI-05, the other direction.)
 *
 * The counterpart to `unreachableDestinations`, and it reads the opposite way round because the
 * API does: `usePackageAirports` answers with the airports that DO work, so anything outside
 * that set is what cannot. Same asymmetry though — `reachable` is null whenever the answer was
 * not trustworthy, and then nothing is greyed.
 *
 * An airport the traveller already chose is never greyed. Ch1 §9A: a choice that stops being
 * possible stays visible so they can see what no longer fits and change it themselves.
 *
 * @param code      the airport being drawn
 * @param reachable Set of airports that can serve the chosen destinations, or null
 * @param chosen    is this airport already ticked?
 */
export function isAirportUnreachable(code, reachable, chosen = false) {
  if (chosen || !reachable || !code) return false;
  return !reachable.has(String(code).toUpperCase());
}

/**
 * @param q  enabled, origin, from?, to?, travelDays?, adults, children, childAges?
 * @returns {{ unreachable: Set<string>|null, state: 'idle'|'loading'|'ok'|'error' }}
 *          `unreachable` is null in every state except a trustworthy 'ok'.
 */
export function useDestinationFeasibility(q = {}) {
  const origin = q.enabled && q.origin ? String(q.origin).toUpperCase() : '';
  // One string naming every input, so a changed question cannot be answered by a stale reply.
  const key = origin
    ? [origin, q.from || '', q.to || '', q.travelDays || '', q.adults ?? '', q.children ?? '', q.childAges || ''].join('|')
    : '';

  const [answer, setAnswer] = useState({ key: '', unreachable: null, state: 'idle' });

  useEffect(() => {
    if (!key) return undefined;
    const ctrl = new AbortController();

    const params = { origin };
    if (q.from) params.from = q.from;
    if (q.to) params.to = q.to;
    if (q.travelDays) params.travelDays = String(q.travelDays);
    if (q.adults != null) params.adults = q.adults;
    if (q.children != null) params.children = q.children;
    if (q.childAges) params.childAges = q.childAges;

    axiosInstance
      .get('/flight-availability/feasibility/destinations', { params, signal: ctrl.signal })
      .then(({ data }) => {
        const unreachable = unreachableDestinations(data);
        // A reply we cannot read is an error, not an empty answer: falling through with null
        // keeps every destination selectable instead of quietly greying none of them while
        // claiming to have checked.
        setAnswer({ key, unreachable, state: unreachable ? 'ok' : 'error' });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setAnswer({ key, unreachable: null, state: 'error' });
      });

    return () => ctrl.abort();
    // `key` names every input that belongs in the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = !!key && answer.key === key;
  return {
    unreachable: current ? answer.unreachable : null,
    state: !key ? 'idle' : current ? answer.state : 'loading',
  };
}

export default useDestinationFeasibility;
