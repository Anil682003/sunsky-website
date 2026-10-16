import { describe, it, expect } from 'vitest';
import { unreachableDestinations, isCountryUnreachable } from './useDestinationFeasibility';

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
