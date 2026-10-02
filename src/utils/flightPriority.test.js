import { describe, it, expect } from 'vitest';
import { pickPriorityIndex, pickPriorityFlight, flightStops } from './flightPriority';

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

  it('applies no routing rule of its own: the backend already removed what the policy forbids', () => {
    // Whatever arrives is allowed by the airport's policy, so the cheapest one wins.
    expect(pickPriorityIndex([F(2, 90), F(1, 150), F(0, 170)])).toBe(0);
  });

  it('a caller may still narrow by stops', () => {
    expect(pickPriorityIndex([F(1, 90), F(0, 170)], { maxStops: 0 })).toBe(1);
  });

  it('counts stops per direction, never added across both', () => {
    const oneEachWay = { outLegs: [{}, {}], retLegs: [{}, {}], totalPrice: 300 };
    const twoOut = { outLegs: [{}, {}, {}], retLegs: [{}], totalPrice: 250 };
    expect(flightStops(oneEachWay)).toBe(1);
    expect(flightStops(twoOut)).toBe(2);
    expect(pickPriorityIndex([twoOut, oneEachWay], { maxStops: 1 })).toBe(1);
  });

  it('derives stops from a bare legs list when no explicit stops', () => {
    expect(flightStops({ legs: [{}, {}] })).toBe(1);
    expect(pickPriorityIndex([{ legs: [{}, {}], totalPrice: 300 }, { legs: [{}], totalPrice: 400 }])).toBe(0);
  });

  it('empty, or nothing within the rule → 0 (always a valid index)', () => {
    expect(pickPriorityIndex([])).toBe(0);
    expect(pickPriorityIndex([F(3, 50), F(2, 40)], { maxStops: 1 })).toBe(0);
  });

  it('skips flights without a usable price', () => {
    expect(pickPriorityIndex([F(0, null), F(1, 200)])).toBe(1);
  });
});
