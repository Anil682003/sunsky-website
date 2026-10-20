import { describe, it, expect } from 'vitest';
import { unreachableDestinations, isCountryUnreachable, isAirportUnreachable, visibleAirportGroups } from './useDestinationFeasibility';

/**
 * UI-05 / Ch1 §9A. A destination is greyed only when the cache can PROVE no round trip reaches
 * it from the chosen airport. Everything else stays selectable, because a destination greyed in
 * error is a sale nobody finds out we lost.
 */

const answer = (destinations) => ({ success: true, origin: 'CRL', destinations });

describe('unreachableDestinations', () => {
  it('greys only what is proven unreachable', () => {
    const out = unreachableDestinations(answer({
      AYT: { status: 'FEASIBLE', trips: 42 },
      NYC: { status: 'NOT_FEASIBLE', reason: 'NO_FARES', trips: 0 },
    }));
    expect([...out]).toEqual(['NYC']);
  });

  it('never greys UNKNOWN — the cache saying it cannot judge is not a no', () => {
    // NO_RETURN_FARES is the live case: the feed has outbound fares and no return direction,
    // so the engine cannot pair a trip. That is missing data, not a missing route.
    const out = unreachableDestinations(answer({
      DLM: { status: 'UNKNOWN', reason: 'NO_RETURN_FARES', trips: 0 },
      NYC: { status: 'NOT_FEASIBLE', reason: 'NO_FARES', trips: 0 },
    }));
    expect(out.has('DLM')).toBe(false);
    expect(out.has('NYC')).toBe(true);
  });

  it('an unusable answer says "cannot say", not "everything works"', () => {
    // null and an empty Set both grey nothing today, but an empty Set asserts that every
    // destination is reachable — a claim with nothing behind it.
    for (const bad of [null, undefined, {}, { success: false, destinations: {} }, { success: true }, { success: true, destinations: 'nope' }]) {
      expect(unreachableDestinations(bad)).toBeNull();
    }
  });

  it('a successful answer with nothing unreachable is an answer, not a failure', () => {
    const out = unreachableDestinations(answer({ AYT: { status: 'FEASIBLE', trips: 1 } }));
    expect(out).toBeInstanceOf(Set);
    expect(out.size).toBe(0);
  });

  it('codes are matched without caring about case', () => {
    const out = unreachableDestinations(answer({ nyc: { status: 'NOT_FEASIBLE', trips: 0 } }));
    expect(out.has('NYC')).toBe(true);
  });
});

describe('isCountryUnreachable', () => {
  const unreachable = new Set(['NYC', 'MIA']);

  it('a country is out of reach only when every destination in it is', () => {
    expect(isCountryUnreachable(['NYC', 'MIA'], unreachable)).toBe(true);
  });

  it('one working destination keeps the whole country selectable', () => {
    // Ch1 §9A, case 20: Turkey stays pickable when any Turkish destination can be flown, even
    // if Antalya itself cannot.
    expect(isCountryUnreachable(['NYC', 'AYT'], unreachable)).toBe(false);
  });

  it('a country whose places have not loaded is never greyed', () => {
    // No known destinations is not the same as no reachable ones.
    expect(isCountryUnreachable([], unreachable)).toBe(false);
    expect(isCountryUnreachable(undefined, unreachable)).toBe(false);
  });

  it('with no answer at all, nothing is greyed', () => {
    expect(isCountryUnreachable(['NYC', 'MIA'], null)).toBe(false);
  });

  it('country codes are matched without caring about case', () => {
    expect(isCountryUnreachable(['nyc', 'mia'], unreachable)).toBe(true);
  });
});

describe('isAirportUnreachable', () => {
  const reachable = new Set(['BRU', 'CRL']);

  it('greys an airport that serves none of the chosen destinations', () => {
    // Antalya picked and ANR flies nowhere near it: case 19, the airport direction.
    expect(isAirportUnreachable('ANR', reachable)).toBe(true);
    expect(isAirportUnreachable('BRU', reachable)).toBe(false);
  });

  it('never greys an airport the traveller already chose', () => {
    // Ch1 §9A: their choice stays visible and usable so they can see what no longer fits and
    // change it themselves, rather than finding it disabled under the cursor.
    expect(isAirportUnreachable('ANR', reachable, true)).toBe(false);
  });

  it('with no trustworthy answer, nothing is greyed', () => {
    // Loading, a failed request, or only a whole country picked — all arrive here as null.
    // That is also case 20: with Turkey as a whole chosen, every airport stays in play.
    expect(isAirportUnreachable('ANR', null)).toBe(false);
    expect(isAirportUnreachable('ANR', undefined)).toBe(false);
  });

  it('a missing code is never greyed', () => {
    expect(isAirportUnreachable('', reachable)).toBe(false);
    expect(isAirportUnreachable(undefined, reachable)).toBe(false);
  });

  it('codes are matched without caring about case', () => {
    expect(isAirportUnreachable('bru', reachable)).toBe(false);
    expect(isAirportUnreachable('anr', reachable)).toBe(true);
  });
});

/**
 * Hiding, rather than greying, the departure airports this search cannot use.
 *
 * The contract's wording is "keep it visible with Not available". Dropping the row is only
 * defensible because the two things that rule protects, an unknown answer and a choice the
 * traveller already made, are exactly the two cases that never reach the filter. These tests
 * exist to keep that true: if hiding ever starts eating an unknown or a ticked airport, the
 * change has stopped being cosmetic and has started lying to the customer.
 */
describe('visibleAirportGroups', () => {
  const groups = [
    { iso: 'BE', airports: [{ code: 'BRU' }, { code: 'CRL' }, { code: 'ANR' }] },
    { iso: 'DE', airports: [{ code: 'DUS' }, { code: 'NRN' }] },
  ];
  const reachable = new Set(['BRU', 'DUS']);
  const codesOf = (gs) => gs.flatMap((g) => g.airports.map((a) => a.code));

  it('drops the airports that cannot fly, and counts them', () => {
    const out = visibleAirportGroups(groups, reachable);
    expect(codesOf(out.groups)).toEqual(['BRU', 'DUS']);
    expect(out.hiddenCount).toBe(3);
  });

  it('hides nothing while the answer is unknown', () => {
    // The whole list stays. A loading or failed feasibility check must never read as
    // "these airports do not exist".
    for (const notAnswer of [null, undefined]) {
      const out = visibleAirportGroups(groups, notAnswer);
      expect(codesOf(out.groups)).toEqual(['BRU', 'CRL', 'ANR', 'DUS', 'NRN']);
      expect(out.hiddenCount).toBe(0);
    }
  });

  it('never hides an airport the traveller has already ticked', () => {
    // Charleroi no longer works for this search, but they chose it. It stays, and stays
    // greyed by isAirportUnreachable, so they can see what broke and change it themselves.
    const out = visibleAirportGroups(groups, reachable, (code) => code === 'CRL');
    expect(codesOf(out.groups)).toContain('CRL');
    expect(out.hiddenCount).toBe(2);
  });

  it('drops a country left with no airports, rather than leaving a bare flag', () => {
    const out = visibleAirportGroups(groups, new Set(['DUS']));
    expect(out.groups.map((g) => g.iso)).toEqual(['DE']);
  });

  it('returns nothing to draw when every airport is ruled out', () => {
    const out = visibleAirportGroups(groups, new Set(['XXX']));
    expect(out.groups).toEqual([]);
    expect(out.hiddenCount).toBe(5);
  });

  it('does not mutate the groups it was given', () => {
    const before = JSON.parse(JSON.stringify(groups));
    visibleAirportGroups(groups, reachable);
    expect(groups).toEqual(before);
  });

  it('survives a malformed group', () => {
    expect(visibleAirportGroups(null, reachable)).toEqual({ groups: [], hiddenCount: 0 });
    expect(visibleAirportGroups([{ iso: 'BE' }], reachable)).toEqual({ groups: [], hiddenCount: 0 });
  });
});
