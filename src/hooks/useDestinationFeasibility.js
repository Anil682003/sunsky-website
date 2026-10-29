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
//
// UI-06 lives here too (`clashingAirports`, `useAirportClash` at the bottom): the same
// `origins` answer, asked BEFORE a new destination is applied rather than after, so that a
// traveller with Brussels and Antwerp ticked is asked before Antwerp is dropped for Antalya.
import { useEffect, useState } from 'react';
import axiosInstance from '../services/axiosInstance';
import { usePackageAirports } from './usePackageAirports';
import { scopeLeaves, zoneCity } from '../utils/scopeLeaves';

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
 * PURE. The departure list with the airports this search cannot use taken out of it.
 *
 * A column of dead grey rows reads as a broken page and the traveller can act on none of it,
 * so they are dropped instead. What makes that safe rather than a lie is `isAirportUnreachable`
 * above: it answers false while the feasibility answer is loading or failed, and false for an
 * airport already ticked. So an UNKNOWN is never hidden, and a choice the traveller made never
 * vanishes from under them (Ch1 §9A). Hiding is only ever applied to a proven negative.
 *
 * A country group left with no airports is dropped too: a flag and "BELGIUM" with nothing
 * under it looks worse than the rows it replaced.
 *
 * `hiddenCount` is returned so the panel can admit that the list is shorter than the full
 * roster, which is the one thing greying did better than hiding.
 *
 * @param groups    [{ airports: [{ code }], ... }]
 * @param reachable Set of usable airports, or null when the answer is not trustworthy
 * @param isChosen  (code) => boolean — is this airport already ticked?
 * @returns {{ groups: Array, hiddenCount: number }}
 */
export function visibleAirportGroups(groups, reachable, isChosen = () => false) {
  const list = Array.isArray(groups) ? groups : [];
  let hiddenCount = 0;

  const kept = list
    .map((g) => {
      const airports = (g.airports || []).filter((a) => {
        const hide = isAirportUnreachable(a?.code, reachable, !!isChosen(a?.code));
        if (hide) hiddenCount += 1;
        return !hide;
      });
      return { ...g, airports };
    })
    .filter((g) => g.airports.length > 0);

  return { groups: kept, hiddenCount };
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

// ── UI-06: ask before dropping airports that clash with a new destination ──────────────────
//
// Brussels and Antwerp are ticked, and the traveller picks a destination only Brussels flies
// to. Applying it as it stands prices a search half of whose airports can never answer;
// quietly unticking Antwerp replaces a choice they made (Ch1 §9A). So the pick is held back and
// they are asked, with the airports that do not fit named, and nothing changes until they say.
//
// Two rules decide when there is anything to ask, and both lean the same way as UI-05:
//   - Only a POSITIVE answer can raise the question. While the check runs, when it fails, or
//     when the pick is one we cannot check (a whole country, a region), the pick goes through
//     as it is. Unknown is not impossible, and a question asked on no evidence is a nag.
//   - An airport fits when it serves ANY destination in the pick (case 20), so the check is
//     asked with every destination at once and `origins` is already that union.

/**
 * PURE. Which of the traveller's departure airports a pick strands, and what to ask.
 *
 *   'none'    nothing to ask: no airports ticked, or every one of them serves the pick
 *   'unknown' we cannot say (loading, failed, or not checkable), so nothing is asked either
 *   'some'    ask: `clashing` do not fit, `keep` do, and removing `clashing` is offered
 *   'all'     every ticked airport is stranded. Nothing is offered for removal, because
 *             unticking all of them would turn the search into No preference behind the
 *             traveller's back; they change airports first. One airport ticked that does not
 *             fit is this case too, which is the single-airport rule ("not selectable until
 *             the airport changes").
 *
 * An empty `serving` Set is an answer, not a failure: the check came back and no airport has
 * a package there, so everything ticked clashes. Only null says "we cannot tell".
 *
 * @param selected codes of the airports the traveller ticked (No preference = [])
 * @param serving  Set of airports with a package to at least one destination in the pick
 *                 (`origins` from usePackageAirports), or null when there is no trustworthy
 *                 answer
 * @returns {{ state: 'none'|'unknown'|'some'|'all', clashing: string[], keep: string[] }}
 */
export function clashingAirports({ selected, serving } = {}) {
  const chosen = [...new Set(
    (Array.isArray(selected) ? selected : []).filter(Boolean).map((c) => String(c).toUpperCase())
  )];
  if (!chosen.length) return { state: 'none', clashing: [], keep: [] };
  if (!(serving instanceof Set)) return { state: 'unknown', clashing: [], keep: chosen };

  const fits = new Set([...serving].map((c) => String(c).toUpperCase()));
  const clashing = chosen.filter((c) => !fits.has(c));
  const keep = chosen.filter((c) => fits.has(c));
  if (!clashing.length) return { state: 'none', clashing, keep };
  return { state: keep.length ? 'some' : 'all', clashing, keep };
}

/**
 * PURE. The hotel destination codes a homepage pick (DestinationModal's shape) can be checked
 * against, or null when it cannot be.
 *
 * Only a city carries a destination code (UI-05: `p.code` is `hotels.destinationCode`). A
 * whole country or a region carries its own code, and the destinations under it sit in the
 * modal's lazily-fetched places, not here. Case 20 says an airport is fine if it serves ANY
 * destination inside such a pick, and we cannot rule that out without the list, so the WHOLE
 * pick becomes "cannot say" rather than being judged on its cities alone: Spain + Antalya must
 * not strand an airport that flies only to Spain.
 */
export function pickedDestinationCodes(selection) {
  const countries = selection?.countries || [];
  const places = selection?.places || [];
  if (!countries.length || !places.length) return null;
  if (places.some((p) => p?.type !== 'city' || !p.code)) return null;
  const narrowed = new Set(places.map((p) => String(p.countryId)));
  if (countries.some((c) => !narrowed.has(String(c?.id)))) return null;
  return [...new Set(places.map((p) => String(p.code).toUpperCase()))];
}

/**
 * PURE. The same question for a results-page scope (ScopePicker's shape: country, city and
 * area codes).
 *
 * The leaves are what gets searched (utils/scopeLeaves): Turkey + Antalya is Antalya. A
 * country left whole is the case-20 "cannot say" above. So is a city whose country we cannot
 * place, because scopeLeaves then keeps its country whole too. An area is checked through its
 * city, the code the flights are filed under.
 *
 * @param scope  { countries, destinations, zones }
 * @param cities city -> country lookup, [{ code, countryCode }]
 */
export function scopeDestinationCodes(scope, cities = []) {
  const leaves = scopeLeaves(scope || {}, cities);
  if (leaves.countries.length) return null;
  const codes = [...leaves.destinations, ...leaves.zones.map(zoneCity)]
    .filter(Boolean)
    .map((c) => String(c).toUpperCase());
  return codes.length ? [...new Set(codes)] : null;
}

const NO_CLASH = { state: 'none', clashing: [], keep: [] };

/**
 * UI-06. Holds a destination pick back while we find out whether it strands any ticked
 * airport, and says what to ask if it does.
 *
 * The page calls `hold({ value, destinations, names })` instead of applying the pick, then:
 *   - `clear`    apply `pending.value` as it is and `settle()`: nothing clashes, or we could
 *                not find out
 *   - `asking`   show the question (`verdict`); "Keep" is `settle()` alone, "Remove" is
 *                removing `verdict.clashing`, applying `pending.value`, then `settle()`
 *   - `checking` the answer is on its way; nothing is flagged in the meantime
 *
 * `selected` is read live, so a traveller who unticks Antwerp while the question is open has
 * answered it: the verdict turns 'none' and the pick goes through. The check is the same
 * `/feasibility` question usePackageAirports asks everywhere else, so `query` is whatever the
 * page already sends it (dates, party), minus the destinations.
 *
 * @param selected the airports the traveller has ticked right now ([] = nothing to clash)
 * @param query    usePackageAirports inputs other than `enabled` and `destinations`
 */
export function useAirportClash({ selected = [], query = {} } = {}) {
  const [pending, setPending] = useState(null);
  const check = usePackageAirports({
    ...query,
    enabled: !!pending,
    destinations: pending?.destinations || [],
  });

  const verdict = pending ? clashingAirports({ selected, serving: check.origins }) : NO_CLASH;
  // A failed check settles too: it leaves `origins` null, the verdict 'unknown', and the pick
  // goes through rather than waiting on an answer that is not coming.
  const settled = !!pending && (check.state === 'ok' || check.state === 'error');
  const asking = !!pending && (verdict.state === 'some' || verdict.state === 'all');

  return {
    pending,
    verdict,
    asking,
    clear: !!pending && !asking && (verdict.state === 'none' || settled),
    checking: !!pending && !asking && !settled && verdict.state !== 'none',
    hold: setPending,
    settle: () => setPending(null),
  };
}

export default useDestinationFeasibility;
