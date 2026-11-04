// Homepage Flight + Hotel: may Search start for this airport × destination combination?
// (Levent, 4 Nov 2026; Ch1 §9A.) Answered from the same flight-feasibility check that greys the
// airports (usePackageAirports: the airports with a package to ANY chosen destination, for the
// chosen dates and travellers), so the button and the list never disagree.
//
//   'ok'        search may start
//   'checking'  the check is running: Search waits, briefly
//   'none'      proven: no chosen airport has a package to any chosen destination
//
// Only a proven answer blocks. A failed check, or a pick the check cannot judge (a whole country
// or region, no city code), never does: a technical error is not "no package".

/**
 * @param {object} q
 * @param {'package'|string} q.transport
 * @param {string[]} q.chosenOrigins      ticked airports ([] = no preference = every airport)
 * @param {string[]} q.destinationCodes   city destination codes the check was asked about
 * @param {Set<string>|null} q.reachable  airports serving at least one of them (null = no answer)
 * @param {'idle'|'loading'|'ok'|'error'} q.state
 * @returns {'ok'|'checking'|'none'}
 */
export function searchGate({ transport, chosenOrigins = [], destinationCodes = [], reachable = null, state = 'idle' }) {
  if (transport !== 'package' || destinationCodes.length === 0) return 'ok';
  if (state === 'loading') return 'checking';
  if (state !== 'ok' || !reachable) return 'ok';
  if (chosenOrigins.length === 0) return reachable.size > 0 ? 'ok' : 'none';
  return chosenOrigins.some((o) => reachable.has(String(o).toUpperCase())) ? 'ok' : 'none';
}

/**
 * PURE. Destinations none of the ticked airports can reach: OR within the airport group, so a
 * destination is greyed only when EVERY ticked airport is proven unable to reach it.
 *
 * @param {Array<Set<string>|null>} perOrigin  one `unreachableDestinations` answer per airport
 * @returns {Set<string>|null}  null when any answer is missing (unknown is not impossible)
 */
export function unreachableFromAll(perOrigin) {
  if (!Array.isArray(perOrigin) || perOrigin.length === 0 || perOrigin.some((s) => !s)) return null;
  const [first, ...rest] = perOrigin;
  return new Set([...first].filter((code) => rest.every((s) => s.has(code))));
}
