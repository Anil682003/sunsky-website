import { describe, it, expect } from 'vitest';
import {
  unreachableDestinations, isCountryUnreachable, isAirportUnreachable, visibleAirportGroups,
  clashingAirports, pickedDestinationCodes, scopeDestinationCodes,
} from './useDestinationFeasibility';
import { mergeFeasibility } from './usePackageAirports';

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

/**
 * UI-06 / Ch1 §9A, Ch3 §4A. Brussels and Antwerp are ticked and the traveller picks a
 * destination only Brussels flies to. The pick is held and they are asked before Antwerp goes;
 * these are the rules for when there is anything to ask.
 */
describe('clashingAirports', () => {
  it('nothing to ask when every ticked airport serves the pick', () => {
    expect(clashingAirports({ selected: ['BRU', 'ANR'], serving: new Set(['BRU', 'ANR', 'CRL']) }))
      .toEqual({ state: 'none', clashing: [], keep: ['BRU', 'ANR'] });
  });

  it('names the airports that do not fit, and the ones that do', () => {
    // The backlog's own case: BRU + ANR, the destination works from BRU only.
    expect(clashingAirports({ selected: ['BRU', 'ANR'], serving: new Set(['BRU']) }))
      .toEqual({ state: 'some', clashing: ['ANR'], keep: ['BRU'] });
  });

  it('every ticked airport stranded is its own state, so removal of all is never offered', () => {
    // Unticking both would quietly turn the search into No preference. They change airports.
    expect(clashingAirports({ selected: ['BRU', 'ANR'], serving: new Set(['CRL']) }))
      .toEqual({ state: 'all', clashing: ['BRU', 'ANR'], keep: [] });
  });

  it('one ticked airport that does not fit is the same "all": the pick waits for the airport', () => {
    expect(clashingAirports({ selected: ['ANR'], serving: new Set(['BRU']) }).state).toBe('all');
  });

  it('with no trustworthy answer, nothing is asked', () => {
    // Loading or failed: usePackageAirports hands back null. Unknown is not impossible.
    for (const serving of [null, undefined, ['BRU']]) {
      const out = clashingAirports({ selected: ['BRU', 'ANR'], serving });
      expect(out.state).toBe('unknown');
      expect(out.clashing).toEqual([]);
    }
  });

  it('an empty answer is an answer: nothing serves it, so everything ticked clashes', () => {
    expect(clashingAirports({ selected: ['BRU', 'ANR'], serving: new Set() }).state).toBe('all');
  });

  it('No preference has nothing to clash, whatever the answer says', () => {
    expect(clashingAirports({ selected: [], serving: new Set(['BRU']) }).state).toBe('none');
    expect(clashingAirports({ selected: [], serving: null }).state).toBe('none');
    expect(clashingAirports().state).toBe('none');
  });

  it('a country pick keeps an airport that serves ANY destination in it (case 20)', () => {
    // Turkey asked as its destinations at once: BRU flies to Antalya only, ANR to Dalaman only.
    // The answers arrive as one union, so neither is stranded by Turkey. LGG reaches neither.
    const serving = mergeFeasibility([
      { origins: ['BRU'] },   // AYT
      { origins: ['ANR'] },   // DLM
    ]).origins;
    expect(clashingAirports({ selected: ['BRU', 'ANR'], serving }).state).toBe('none');
    expect(clashingAirports({ selected: ['BRU', 'ANR', 'LGG'], serving }))
      .toEqual({ state: 'some', clashing: ['LGG'], keep: ['BRU', 'ANR'] });
  });

  it('codes are matched without caring about case, and a code ticked twice counts once', () => {
    expect(clashingAirports({ selected: ['bru', 'ANR', 'anr'], serving: new Set(['BRU']) }))
      .toEqual({ state: 'some', clashing: ['ANR'], keep: ['BRU'] });
  });
});

describe('pickedDestinationCodes (homepage DestinationModal picks)', () => {
  const TR = { id: 1, code: 'TR' };
  const ES = { id: 2, code: 'SP' };
  const city = (code, countryId) => ({ type: 'city', code, countryId, name: code });

  it('cities are checked by their hotel destination codes', () => {
    expect(pickedDestinationCodes({ countries: [TR], places: [city('AYT', 1), city('dlm', 1)] })).toEqual(['AYT', 'DLM']);
  });

  it('a whole country cannot be checked here, so nothing is asked (case 20)', () => {
    expect(pickedDestinationCodes({ countries: [TR], places: [] })).toBeNull();
  });

  it('a whole country beside a city makes the whole pick "cannot say"', () => {
    // Spain + Antalya must not strand an airport that flies only to Spain.
    expect(pickedDestinationCodes({ countries: [TR, ES], places: [city('AYT', 1)] })).toBeNull();
  });

  it('a region carries no destination code, so it cannot be checked either', () => {
    expect(pickedDestinationCodes({ countries: [TR], places: [{ type: 'region', code: 'R1', countryId: 1 }] })).toBeNull();
  });

  it('nothing picked is nothing to check', () => {
    expect(pickedDestinationCodes({ countries: [], places: [] })).toBeNull();
    expect(pickedDestinationCodes(undefined)).toBeNull();
  });
});

describe('scopeDestinationCodes (results-page Where scopes)', () => {
  const cities = [
    { code: 'AYT', countryCode: 'TR' },
    { code: 'SID', countryCode: 'TR' },
    { code: 'PMI', countryCode: 'SP' },
  ];

  it('a city narrows its country: Turkey + Side is checked as Side', () => {
    expect(scopeDestinationCodes({ countries: ['TR'], destinations: ['SID'], zones: [] }, cities)).toEqual(['SID']);
  });

  it('a country left whole is "cannot say" (case 20)', () => {
    expect(scopeDestinationCodes({ countries: ['TR'], destinations: [], zones: [] }, cities)).toBeNull();
    expect(scopeDestinationCodes({ countries: ['TR', 'SP'], destinations: ['SID'], zones: [] }, cities)).toBeNull();
  });

  it('a city we cannot place keeps its country whole, so nothing is asked', () => {
    // Without the lookup scopeLeaves cannot narrow Turkey, and Turkey whole is unknown.
    expect(scopeDestinationCodes({ countries: ['TR'], destinations: ['SID'], zones: [] }, [])).toBeNull();
  });

  it('cities on their own, and areas through their city', () => {
    expect(scopeDestinationCodes({ countries: [], destinations: ['AYT'], zones: [] })).toEqual(['AYT']);
    expect(scopeDestinationCodes({ countries: [], destinations: ['AYT'], zones: ['AYT:16'] })).toEqual(['AYT']);
  });

  it('an empty scope is nothing to check', () => {
    expect(scopeDestinationCodes({ countries: [], destinations: [], zones: [] })).toBeNull();
    expect(scopeDestinationCodes(undefined)).toBeNull();
  });
});
