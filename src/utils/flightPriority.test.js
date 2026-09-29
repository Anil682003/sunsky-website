import { describe, it, expect } from 'vitest';
import { pickPriorityIndex, pickPriorityFlight, flightStops, MAX_STOPS_PER_DIRECTION } from './flightPriority';

const F = (stops, totalPrice) => ({ stops, totalPrice });

describe('default flight: the cheapest, no routing preference (spec 3.6)', () => {
  it('a cheaper one-stop beats a dearer direct', () => {
    const flights = [F(0, 170), F(1, 120), F(0, 210)];
    expect(pickPriorityIndex(flights)).toBe(1);
    expect(pickPriorityFlight(flights).totalPrice).toBe(120);
  });

  it('a direct still wins when it is also the cheapest', () => {
    expect(pickPriorityIndex([F(1, 150), F(0, 140), F(1, 160)])).toBe(1);
  });

  it('never picks a flight with two stops in one direction while one within the rule exists', () => {
    // The old §23 engine would also have refused the €90 two-stop, but for the wrong reason:
    // it would then have picked the €170 direct over the €150 one-stop.
    const flights = [F(2, 90), F(1, 150), F(0, 170)];
    expect(pickPriorityIndex(flights)).toBe(1);
  });

  it('counts stops per direction, never added across both', () => {
    const oneEachWay = { outLegs: [{}, {}], retLegs: [{}, {}], totalPrice: 300 };
    const twoOut = { outLegs: [{}, {}, {}], retLegs: [{}], totalPrice: 250 };
    expect(flightStops(oneEachWay)).toBe(1);
    expect(flightStops(twoOut)).toBe(2);
    expect(pickPriorityIndex([twoOut, oneEachWay])).toBe(1);
  });

  it('derives stops from a bare legs list when no explicit stops', () => {
    expect(flightStops({ legs: [{}, {}] })).toBe(1);
    expect(pickPriorityIndex([{ legs: [{}, {}], totalPrice: 300 }, { legs: [{}], totalPrice: 400 }])).toBe(0);
  });

  it('the ceiling is one stop per direction', () => {
    expect(MAX_STOPS_PER_DIRECTION).toBe(1);
  });

  it('empty, or nothing within the rule → 0 (always a valid index)', () => {
    expect(pickPriorityIndex([])).toBe(0);
    expect(pickPriorityIndex([F(3, 50), F(2, 40)])).toBe(0);
  });

  it('skips flights without a usable price', () => {
    expect(pickPriorityIndex([F(0, null), F(1, 200)])).toBe(1);
  });
});
